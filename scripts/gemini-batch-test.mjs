// Reproduces the structured-output call our resolver makes, to isolate
// whether the issue is the SDK + responseSchema combo or something Next-specific.
import { readFileSync } from "node:fs";
import { GoogleGenAI, Type } from "@google/genai";

const m = readFileSync(".env.local", "utf8").match(/^GEMINI_API_KEY=(.*)$/m);
const ai = new GoogleGenAI({ apiKey: m[1].trim() });

const CATEGORIES = ["groceries","dining","rent","utilities","transport","entertainment","shopping","health","subscriptions","income","transfer","other"];

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    results: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          raw_description: { type: Type.STRING },
          merchant_name: { type: Type.STRING },
          category: { type: Type.STRING, enum: CATEGORIES },
          confidence: { type: Type.NUMBER },
        },
        required: ["raw_description", "merchant_name", "category", "confidence"],
      },
    },
  },
  required: ["results"],
};

const sample = [
  { raw_description: "WOOLWORTHS NEWTOWN", amount_cents: -8400 },
  { raw_description: "TOBYS ESTATE COFFEE", amount_cents: -2200 },
  { raw_description: "TRANSPORT FOR NSW OPAL", amount_cents: -4000 },
];

console.log("calling Gemini with structured output…");
const start = Date.now();
try {
  const r = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ role: "user", parts: [{ text: "Categorise:\n" + sample.map(s => JSON.stringify(s)).join("\n") }] }],
    config: {
      systemInstruction: "Categorise AU bank transactions. Return JSON.",
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0,
    },
  });
  console.log(`OK in ${Date.now() - start}ms`);
  console.log(r.text);
} catch (e) {
  console.error(`FAIL after ${Date.now() - start}ms:`);
  console.error(e);
}
