import { readFileSync } from "node:fs";
import { GoogleGenAI } from "@google/genai";

const m = readFileSync(".env.local", "utf8").match(/^GEMINI_API_KEY=(.*)$/m);
if (!m) {
  console.error("GEMINI_API_KEY not in .env.local");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: m[1].trim() });

const models = [
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-flash-latest",
];

for (const model of models) {
  process.stdout.write(`testing ${model.padEnd(28)} → `);
  try {
    const r = await ai.models.generateContent({
      model,
      contents: "Say 'hi' in one word.",
      config: { temperature: 0, maxOutputTokens: 8 },
    });
    console.log(`OK (${(r.text ?? "").trim().slice(0, 30)})`);
  } catch (e) {
    console.log(`FAIL — ${e.name}: ${(e.message ?? "").slice(0, 200)}`);
  }
}
