import { GoogleGenAI } from "@google/genai";
import { buildRewritePrompt } from "../prompts/rewritePrompt.js";

const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function rewriteNews({ articleText, sourceUrl }) {
  const prompt = buildRewritePrompt({ articleText, sourceUrl });
  const response = await ai.models.generateContent({
    model,
    contents: prompt
  });

  const text = response.text?.trim();
  if (!text) {
    throw new Error("Gemini returned an empty rewrite.");
  }

  return text;
}
