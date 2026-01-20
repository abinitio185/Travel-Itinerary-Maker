
import { GoogleGenAI, Type } from "@google/genai";
import { TravelPackage } from "../types";

/**
 * Custom error class for Gemini-related failures.
 */
export class GeminiError extends Error {
  constructor(message: string, public readonly status?: number, public readonly details?: any) {
    super(message);
    this.name = 'GeminiError';
  }
}

export const parseItineraryFromText = async (text: string): Promise<Partial<TravelPackage>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `You are an expert travel consultant. Extract and structure travel package details from the provided text.
      The text contains package details, itinerary pointers, and pricing.
      
      Focus on extracting:
      - Package Name, Destination, Duration, Currency.
      - Pricing: Extract ALL price variants mentioned (e.g., "Solo Rider", "Per Person", "Extra Bed", "Child with bed"). 
        Return them as a list of objects with "label" and "value".
      - Inclusions & Exclusions.
      - Itinerary: For each day, extract the Title, Location, and a list of specific "Activities" or "Pointers".
      
      Text: ${text}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            packageName: { type: Type.STRING },
            destination: { type: Type.STRING },
            duration: { type: Type.STRING },
            currency: { type: Type.STRING },
            pricing: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING, description: "e.g. Solo Bike, Per Person, Family of 4" },
                  value: { type: Type.STRING, description: "The price amount" }
                },
                required: ['label', 'value']
              }
            },
            inclusions: { type: Type.ARRAY, items: { type: Type.STRING } },
            exclusions: { type: Type.ARRAY, items: { type: Type.STRING } },
            itinerary: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  day: { type: Type.NUMBER },
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  location: { type: Type.STRING },
                  activities: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ['day', 'title', 'location', 'activities']
              }
            }
          },
          required: ['packageName', 'destination', 'itinerary', 'pricing']
        }
      }
    });

    const textResult = response.text;
    if (!textResult) {
        throw new GeminiError("The AI model returned an empty response.");
    }
    
    try {
        return JSON.parse(textResult);
    } catch (parseErr) {
        throw new GeminiError("Failed to structure the document data correctly.");
    }
    
  } catch (e: any) {
    if (e.message?.includes('429')) throw new GeminiError("Rate limit exceeded.", 429);
    throw new GeminiError(e.message || "An unexpected error occurred.");
  }
};

export const generateDayImage = async (
  location: string, 
  title: string, 
  description: string,
  customPrompt?: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const baseInstructions = `A professional travel photograph of ${location}. ${title}. ${description}. Cinematic, high resolution.`;
  const prompt = customPrompt ? `${baseInstructions} ${customPrompt}` : baseInstructions;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: prompt }] },
      config: { imageConfig: { aspectRatio: "16:9" } }
    });

    const candidate = response.candidates?.[0];
    if (candidate) {
      for (const part of candidate.content.parts) {
        if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new GeminiError("No image was generated.");
  } catch (e: any) {
    throw new GeminiError(e.message || "Failed to generate image.");
  }
};
