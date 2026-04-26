import { Type, type Schema } from "@google/genai";
import { CATEGORY_VALUES, type Category } from "@/lib/db/schema";
import { geminiClient, GEMINI_MODEL } from "./client";

export interface CategorizeRequest {
  rawDescription: string;
  amountCents: number;
}

export interface CategorizeResult {
  rawDescription: string;
  merchantName: string;
  category: Category;
  /** 0..1, model's self-rated confidence. */
  confidence: number;
}

const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    results: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          raw_description: { type: Type.STRING },
          merchant_name: { type: Type.STRING },
          category: { type: Type.STRING, enum: [...CATEGORY_VALUES] },
          confidence: { type: Type.NUMBER },
        },
        required: ["raw_description", "merchant_name", "category", "confidence"],
        propertyOrdering: ["raw_description", "merchant_name", "category", "confidence"],
      },
    },
  },
  required: ["results"],
};

const SYSTEM_PROMPT = `You categorise Australian bank transactions for a personal-finance app.
The user is in Sydney; AUD only; merchants are Australian unless very obviously not.

For each input transaction, return:
- merchant_name: a clean canonical name. Examples: "WOOLWORTHS NEWTOWN" -> "Woolworths"; "TOBYS ESTATE COFFEE 2034" -> "Toby's Estate"; "UBER TRIP HELP.UBER.COM" -> "Uber".
- category: one of groceries, dining, housing, utilities, transport, entertainment, shopping, health, income, transfer, other.
- confidence: 0..1. Use ≥0.9 for clear merchants like Woolworths/Coles. Use 0.5–0.7 when the description is cryptic or ambiguous. Below 0.5 if you're guessing.

CATEGORISE BY SUBSTANCE, NOT BY BILLING PATTERN. A transaction's category is what the user is buying, not how often it bills. A monthly gym membership is health. A monthly streaming service is entertainment. There is NO "subscriptions" category — recurring billing is tracked separately on the recurring/subscriptions page; the budget category is the substance.

Categorisation guidance:
- groceries: supermarkets and grocers (Woolworths, Coles, Aldi, Harris Farm, IGA).
- dining: cafes, restaurants, takeaway, food delivery (Uber Eats, DoorDash, Menulog).
- housing: residential rent, mortgage interest charges, mortgage repayments, strata / body corporate fees, council rates. Anything that's a cost of having a place to live.
- utilities: electricity (AGL, Origin, EnergyAustralia), gas, water (Sydney Water), internet, phone, mobile (Vodafone, Telstra, Optus).
- transport: Opal, Uber/DiDi/Ola, fuel (BP, Shell, 7-Eleven, Caltex), tolls (Linkt), car loan repayments (Toyota Finance, etc).
- entertainment: cinema, theatre, events, concerts. ALSO: streaming media subscriptions (Netflix, Disney+, Stan, Hulu, Paramount+, Binge, Spotify, Apple Music, YouTube Premium), news / magazine subscriptions (NYTimes, AFR, Australian, Atlantic).
- shopping: clothing, homeware, hardware (Bunnings, Officeworks, JB Hi-Fi). Amazon Prime if predominantly used for shipping.
- health: pharmacies (Chemist Warehouse), doctors, dentists, physio, AND gym / fitness memberships (Goodlife, Anytime Fitness, F45, yoga studios, Pilates studios, Strava Premium, MyFitnessPal Premium).
- income: payroll, refunds from employers, deposits labelled SALARY/PAY, dividend / interest credits.
- transfer: internal transfers between accounts; credit card payments. The pipeline already detects most transfers structurally — only assign here if the description clearly says transfer/payment.
- other: cloud storage / general digital tools that don't fit a substance category (Apple One, iCloud, Google One, Dropbox, OneDrive, Notion, GitHub, AWS personal, Adobe Creative Cloud, password managers, VPNs). Insurance (AAMI, NRMA) when it's not health-specific. Anything else genuinely uncategorised.

Use ONLY the categories listed. Do not invent new ones. 'rent' and 'subscriptions' have been removed — use 'housing' and the appropriate substance category respectively.`;

/**
 * Categorises a batch of transactions in one Gemini call. Returns one result
 * per input. Throws if the model returns malformed output (responseSchema
 * should prevent this, but we defensively validate).
 */
export async function categorizeBatch(
  requests: CategorizeRequest[],
): Promise<CategorizeResult[]> {
  if (requests.length === 0) return [];

  const userPrompt =
    "Categorise the following transactions. Each line is JSON: \n" +
    requests
      .map((r) =>
        JSON.stringify({
          raw_description: r.rawDescription,
          amount_cents: r.amountCents,
        }),
      )
      .join("\n");

  const ai = geminiClient();
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0,
    },
  });

  const text = response.text;
  if (!text) throw new Error("Gemini returned no text");

  let parsed: { results?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Gemini returned non-JSON despite responseSchema: ${text.slice(0, 200)}`);
  }

  if (!Array.isArray(parsed.results)) {
    throw new Error("Gemini response missing `results` array");
  }

  const validCategories = new Set<string>(CATEGORY_VALUES);
  return parsed.results.map((r, i) => {
    const item = r as Record<string, unknown>;
    const category = item.category as string;
    if (!validCategories.has(category)) {
      throw new Error(`Gemini returned invalid category at index ${i}: ${category}`);
    }
    const confidence = Number(item.confidence);
    return {
      rawDescription: String(item.raw_description),
      merchantName: String(item.merchant_name),
      category: category as Category,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    };
  });
}
