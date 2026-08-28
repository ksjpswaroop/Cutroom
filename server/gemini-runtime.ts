import { GoogleGenAI } from "@google/genai";
import {
  DEFAULT_GEMINI_IMAGE_MODEL,
  DEFAULT_GEMINI_TEXT_MODEL,
  isGeminiImageModel,
  isGeminiTextModel,
  type GeminiImageModel,
  type GeminiTextModel,
} from "./gemini-models";

let geminiApiKey = process.env.GEMINI_API_KEY?.trim() || "";
let geminiTextModel: GeminiTextModel = isGeminiTextModel(process.env.GEMINI_TEXT_MODEL || "")
  ? process.env.GEMINI_TEXT_MODEL as GeminiTextModel
  : DEFAULT_GEMINI_TEXT_MODEL;
let geminiImageModel: GeminiImageModel = isGeminiImageModel(process.env.GEMINI_IMAGE_MODEL || "")
  ? process.env.GEMINI_IMAGE_MODEL as GeminiImageModel
  : DEFAULT_GEMINI_IMAGE_MODEL;

if (!geminiApiKey) {
  console.warn("Warning: GEMINI_API_KEY is not set. AI features will not work.");
}

let ai = new GoogleGenAI({ apiKey: geminiApiKey });

export function configureGeminiApiKey(apiKey: string): void {
  geminiApiKey = apiKey.trim();
  process.env.GEMINI_API_KEY = geminiApiKey;
  ai = new GoogleGenAI({ apiKey: geminiApiKey });
}

export function configureGeminiModels(textModel: GeminiTextModel, imageModel: GeminiImageModel): void {
  geminiTextModel = textModel;
  geminiImageModel = imageModel;
  process.env.GEMINI_TEXT_MODEL = textModel;
  process.env.GEMINI_IMAGE_MODEL = imageModel;
}

export function getGeminiApiKey(): string {
  return geminiApiKey;
}

export function getGeminiTextModel(): GeminiTextModel {
  return geminiTextModel;
}

export function getGeminiImageModel(): GeminiImageModel {
  return geminiImageModel;
}

export function getGeminiClient(): GoogleGenAI {
  return ai;
}
