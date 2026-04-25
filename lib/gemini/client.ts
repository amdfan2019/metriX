import { GoogleGenAI } from "@google/genai";

let cached: GoogleGenAI | null = null;

/**
 * Returns a singleton GoogleGenAI client backed by GEMINI_API_KEY.
 * The SDK auto-reads the env var when the constructor argument is omitted,
 * but we pass it explicitly so missing-key errors are clearer.
 */
export function geminiClient(): GoogleGenAI {
  if (cached) return cached;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  cached = new GoogleGenAI({ apiKey });
  return cached;
}

/** Default model. Slice 4+ uses Gemini 3 Flash preview for structured output + speed. */
export const GEMINI_MODEL = "gemini-3-flash-preview";

// Test-only utility — clears the singleton so tests can swap the env mid-run.
export function __resetGeminiClientForTests() {
  cached = null;
}
