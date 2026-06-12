export interface LeadData {
  name?: string;
  age?: string;
  phone?: string;
  email?: string;
  checkInDate?: string;
  lengthOfStay?: string;
  occupancy?: string;
  budget?: string;
  stayType?: "daily" | "monthly" | "unknown";
  interestLevel: "low" | "medium" | "high";
  conversationSummary?: string;
  conversionPotential?: "cold" | "warm" | "hot";
}

const NAME_PATTERNS = [
  /(?:my name is|i'm|i am|call me|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
  /(?:name['']?s?\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
  /(?:thank you|thanks|great|welcome|absolutely|sure|wonderful|perfect|alright)\s*,?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
  /(?:mr\.?|ms\.?|mrs\.?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
  /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?)\b(?:\s*,\s*(?:a monthly|a daily|so|let me|your|the|I'll|we|our))/,
];

const PHONE_PATTERNS = [
  /(?:phone|contact|number|call me (?:at|on)|reach me (?:at|on)|my (?:cell|mobile) is)[:\s]+([+]?[\d\s-]{10,15})/i,
  /(?:number is|contact is)[:\s]+([+]?[\d\s-]{10,15})/i,
  /(\d{10})/,
  /([+]\d{1,3}\s?\d{10})/,
];

const EMAIL_PATTERN = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;

const AGE_PATTERN = /(?:i'm|i am|age\s+(?:is\s+)?|aged\s+)(\d{1,3})(?:\s+years?\s+old)?/i;

const DAILY_KEYWORDS = ["daily", "per night", "short stay", "one night", "few days", "night"];
const MONTHLY_KEYWORDS = ["monthly", "month", "long stay", "long term", "30 days", "rent", "renting"];

const HIGH_INTEREST_KEYWORDS = [
  "book", "reserve", "move in", "available", "when can", "schedule",
  "visit", "confirm", "sign", "pay", "budget", "afford", "want to book",
  "like to book", "can i move", "ready to", "how soon",
];

const MEDIUM_INTEREST_KEYWORDS = [
  "interested", "looking for", "considering", "thinking about",
  "tell me more", "price", "pricing", "cost", "how much",
  "what's the rate", "what is the rate",
];

const COLD_KEYWORDS = ["just browsing", "just curious", "maybe later", "not right now", "just checking"];
const WARM_KEYWORDS = ["interested", "looking", "considering", "thinking", "tell me more", "how much"];
const HOT_KEYWORDS = ["book", "reserve", "move in", "available", "when can i", "schedule a visit", "confirm", "ready to", "sign"];

export function parseLeadFromText(text: string, existingLead: LeadData): LeadData {
  const lead: LeadData = { ...existingLead };
  const lower = text.toLowerCase();

  for (const pattern of NAME_PATTERNS) {
    const match = text.match(pattern);
    if (match && !lead.name) {
      const candidate = match[1].trim();
      const excluded = ["thank", "thanks", "great", "sure", "absolutely", "welcome", "wonderful", "perfect", "alright", "yes", "yeah", "okay", "surely", "certainly", "definitely", "absolutely"];
      if (!excluded.includes(candidate.toLowerCase())) {
        lead.name = candidate;
      }
    }
  }

  for (const pattern of PHONE_PATTERNS) {
    const match = text.match(pattern);
    if (match && !lead.phone) {
      lead.phone = match[1].trim().replace(/\s/g, "");
    }
  }

  const emailMatch = text.match(EMAIL_PATTERN);
  if (emailMatch && !lead.email) {
    lead.email = emailMatch[1].trim();
  }

  const ageMatch = text.match(AGE_PATTERN);
  if (ageMatch && !lead.age) {
    const age = parseInt(ageMatch[1], 10);
    if (age >= 18 && age <= 100) {
      lead.age = ageMatch[1];
    }
  }

  if (!lead.stayType || lead.stayType === "unknown") {
    for (const kw of DAILY_KEYWORDS) {
      if (lower.includes(kw)) {
        lead.stayType = "daily";
        break;
      }
    }
    for (const kw of MONTHLY_KEYWORDS) {
      if (lower.includes(kw)) {
        lead.stayType = "monthly";
        break;
      }
    }
    if (!lead.stayType) {
      lead.stayType = "unknown";
    }
  }

  const highCount = HIGH_INTEREST_KEYWORDS.filter((kw) => lower.includes(kw)).length;
  const medCount = MEDIUM_INTEREST_KEYWORDS.filter((kw) => lower.includes(kw)).length;

  if (highCount >= 2 || (highCount >= 1 && medCount >= 2)) {
    lead.interestLevel = "high";
  } else if (medCount >= 1 || highCount >= 1) {
    if (lead.interestLevel !== "high") {
      lead.interestLevel = "medium";
    }
  }

  const hotCount = HOT_KEYWORDS.filter((kw) => lower.includes(kw)).length;
  const warmCount = WARM_KEYWORDS.filter((kw) => lower.includes(kw)).length;
  const coldCount = COLD_KEYWORDS.filter((kw) => lower.includes(kw)).length;

  if (hotCount >= 1) {
    lead.conversionPotential = "hot";
  } else if (warmCount >= 1 && coldCount === 0) {
    lead.conversionPotential = "warm";
  } else if (coldCount >= 1) {
    lead.conversionPotential = "cold";
  } else if (!lead.conversionPotential) {
    lead.conversionPotential = "warm";
  }

  return lead;
}

export function buildConversationSummary(transcript: { role: string; text: string }[]): string {
  return transcript.map((t) => `${t.role}: ${t.text}`).join(" | ");
}

export function createEmptyLead(): LeadData {
  return {
    stayType: "unknown",
    interestLevel: "low",
    conversionPotential: "warm",
  };
}
