
import { GoogleGenAI, Type } from "@google/genai";
import { TravelPackage } from "../types";

/**
 * Custom error class for Gemini-related failures to distinguish between 
 * transient API issues, validation errors, and configuration problems.
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
      contents: `You are an expert travel consultant for motorcycle tours. Extract and structure travel package details from the provided text.
      The user specifically wants the itinerary to maintain the "day-wise pointers" format seen in the source document.
      
      Focus on extracting:
      - Package Name, Destination, Duration, Currency.
      - Pricing: Solo bike, Dual rider, Own bike, Extra prices, Dual sharing extra, Single room extra.
      - Inclusions & Exclusions.
      - Itinerary: For each day, extract the Title, Location, and a list of specific "Activities" or "Pointers" as shown in the document.
      
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
            soloBikePrice: { type: Type.STRING },
            dualRiderPrice: { type: Type.STRING },
            ownBikePrice: { type: Type.STRING },
            extraPrice: { type: Type.STRING },
            dualSharingExtra: { type: Type.STRING },
            singleRoomExtra: { type: Type.STRING },
            inclusions: { type: Type.ARRAY, items: { type: Type.STRING } },
            exclusions: { type: Type.ARRAY, items: { type: Type.STRING } },
            itinerary: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  day: { type: Type.NUMBER },
                  title: { type: Type.STRING },
                  description: { type: Type.STRING, description: "A summary of the day if available" },
                  location: { type: Type.STRING },
                  activities: { 
                    type: Type.ARRAY, 
                    items: { type: Type.STRING },
                    description: "The day-wise pointers/bullet points from the document"
                  }
                },
                required: ['day', 'title', 'location', 'activities']
              }
            }
          },
          required: ['packageName', 'destination', 'itinerary']
        }
      }
    });

    const textResult = response.text;
    if (!textResult) {
        throw new GeminiError("The AI model returned an empty response. Please try with a clearer document.");
    }
    
    try {
        return JSON.parse(textResult);
    } catch (parseErr) {
        console.error("Failed to parse Gemini JSON output:", textResult);
        throw new GeminiError("Failed to structure the document data correctly. The AI output was malformed.");
    }
    
  } catch (e: any) {
    console.error("Gemini Parsing Error Details:", e);
    
    if (e.message?.includes('429')) {
        throw new GeminiError("Rate limit exceeded. Please wait a few seconds before trying again.", 429);
    }
    if (e.message?.includes('403') || e.message?.includes('401')) {
        throw new GeminiError("API Key authentication failed. Please check your API key permissions.", 403);
    }
    if (e.message?.includes('SAFETY')) {
        throw new GeminiError("The document content was flagged by safety filters. Please ensure it contains travel-related text.");
    }

    throw new GeminiError(e.message || "An unexpected error occurred while analyzing the document.");
  }
};

export const generateDayImage = async (
  location: string, 
  title: string, 
  description: string,
  customPrompt?: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const baseInstructions = `A high-end, professional travel photograph of ${location}. Topic: ${title}. Description: ${description}. Cinematic lighting, 8k resolution, National Geographic photography style.`;
  const prompt = customPrompt ? `${baseInstructions} Additionally, focus on: ${customPrompt}` : baseInstructions;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: prompt }]
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9"
        }
      }
    });

    const candidate = response.candidates?.[0];
    if (candidate) {
      for (const part of candidate.content.parts) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    }
    throw new GeminiError("No image was generated. The AI model might be busy or the prompt was restricted.");
  } catch (e: any) {
    console.error("Image Generation Error Details:", e);
    if (e.message?.includes('SAFETY')) {
        throw new GeminiError("Image generation blocked due to safety policies. Try modifying the location or title.");
    }
    throw new GeminiError(e.message || "Failed to generate image.");
  }
};
