import { GoogleGenAI } from "@google/genai";
import { buildImageIdeaPrompt } from "../prompts/imagePrompt.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const imagePromptModel = process.env.GEMINI_IMAGE_PROMPT_MODEL || "gemini-2.5-flash";
const imageModel = process.env.GEMINI_IMAGE_MODEL || "imagen-4.0-generate-001";

export async function generateArticleImage({ rewrittenText }) {
  const imagePrompt = await createImagePrompt({ rewrittenText });
  const response = await ai.models.generateImages({
    model: imageModel,
    prompt: imagePrompt,
    config: {
      numberOfImages: 1,
      aspectRatio: "4:3"
    }
  });

  const generatedImage = response.generatedImages?.[0]?.image;
  if (!generatedImage?.imageBytes) {
    throw new Error("Imagen не повернув зображення.");
  }

  return {
    prompt: imagePrompt,
    mimeType: generatedImage.mimeType || "image/png",
    imageBase64: generatedImage.imageBytes
  };
}

async function createImagePrompt({ rewrittenText }) {
  const response = await ai.models.generateContent({
    model: imagePromptModel,
    contents: buildImageIdeaPrompt({ rewrittenText })
  });

  const prompt = response.text?.trim();
  if (!prompt) {
    throw new Error("Не вдалося сформувати промпт для зображення.");
  }

  return prompt;
}
