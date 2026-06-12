import { GoogleGenAI } from "@google/genai";

const EXTRACTION_PROMPT = `You are a lead extraction engine for a co-living business called Colive Pune.
You will receive a conversation transcript between a receptionist (Sarah) and a caller.
Extract the following information and return ONLY valid JSON with these exact keys.
If a field is not found in the transcript, set it to null.

Required JSON format:
{
  "name": "full name or null",
  "age": "age as string or null",
  "phone": "phone number as digits only or null",
  "email": "email address or null",
  "stayType": "daily or monthly or unknown",
  "checkInDate": "date mentioned or null",
  "lengthOfStay": "duration mentioned or null",
  "occupancy": "number of people or null",
  "budget": "budget mentioned or null",
  "interestLevel": "low or medium or high",
  "conversionPotential": "cold or warm or hot",
  "conversationSummary": "2-3 sentence summary of what the caller was looking for and their potential to convert"
}

Rules:
- phone: normalize to digits only, remove spaces, dots, dashes. If transcript says "8.46956 336" or "eight four six nine" convert to proper digits.
- name: extract ONLY the person's actual name, no extra words like "and", "I am", etc.
- age: just the number as a string
- stayType: "daily" if they mentioned per night/short stay, "monthly" if long term/monthly, "unknown" if unclear
- interestLevel: "high" if they want to book/move in soon, "medium" if interested but not urgent, "low" if just browsing
- conversionPotential: "hot" if ready to book, "warm" if seriously interested, "cold" if unlikely
- conversationSummary: summarize what they wanted and likelihood of joining

Return ONLY the JSON object, no markdown, no code fences, no extra text.`;

export interface ExtractedLead {
  name: string | null;
  age: string | null;
  phone: string | null;
  email: string | null;
  stayType: "daily" | "monthly" | "unknown";
  checkInDate: string | null;
  lengthOfStay: string | null;
  occupancy: string | null;
  budget: string | null;
  interestLevel: "low" | "medium" | "high";
  conversionPotential: "cold" | "warm" | "hot";
  conversationSummary: string | null;
}

export async function extractLeadFromTranscript(
  apiKey: string,
  transcript: string
): Promise<ExtractedLead> {
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: `${EXTRACTION_PROMPT}\n\nTRANSCRIPT:\n${transcript}`,
  });

  const text = response.text?.trim() || "";
  console.log("[Extractor] Raw response:", text.substring(0, 300));

  try {
    let cleaned = text;
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();

    const parsed = JSON.parse(cleaned);
    return {
      name: parsed.name || null,
      age: parsed.age || null,
      phone: parsed.phone || null,
      email: parsed.email || null,
      stayType: parsed.stayType || "unknown",
      checkInDate: parsed.checkInDate || null,
      lengthOfStay: parsed.lengthOfStay || null,
      occupancy: parsed.occupancy || null,
      budget: parsed.budget || null,
      interestLevel: parsed.interestLevel || "low",
      conversionPotential: parsed.conversionPotential || "warm",
      conversationSummary: parsed.conversationSummary || null,
    };
  } catch (e) {
    console.error("[Extractor] Failed to parse Gemini response:", e);
    console.error("[Extractor] Raw text:", text);
    return {
      name: null,
      age: null,
      phone: null,
      email: null,
      stayType: "unknown",
      checkInDate: null,
      lengthOfStay: null,
      occupancy: null,
      budget: null,
      interestLevel: "low",
      conversionPotential: "warm",
      conversationSummary: transcript.substring(0, 200),
    };
  }
}
