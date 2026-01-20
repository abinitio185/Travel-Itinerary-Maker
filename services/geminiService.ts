
import { GoogleGenAI, Type } from "@google/genai";
import { TravelPackage } from "../types";

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
    if (!textResult) throw new Error("Empty response from AI.");
    return JSON.parse(textResult);
  } catch (e: any) {
    console.error("Gemini Parsing Error:", e);
    throw new Error(`Failed to process itinerary: ${e.message || "Unknown error"}`);
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
    throw new Error("No image data returned from AI model.");
  } catch (e: any) {
    console.error("Image Generation Error:", e);
    throw e;
  }
};
