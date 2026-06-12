import { appendFile, readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

const LEADS_DIR = join(process.cwd(), "leads");

const CSV_HEADERS = [
  "timestamp",
  "name",
  "age",
  "phone",
  "email",
  "stayType",
  "checkInDate",
  "lengthOfStay",
  "occupancy",
  "budget",
  "interestLevel",
  "conversionPotential",
  "conversationSummary",
];

function escapeCsv(value: string | undefined | null): string {
  if (!value) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("|")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export interface LeadRecord {
  timestamp: string;
  name?: string | null;
  age?: string | null;
  phone?: string | null;
  email?: string | null;
  stayType?: string;
  checkInDate?: string | null;
  lengthOfStay?: string | null;
  occupancy?: string | null;
  budget?: string | null;
  interestLevel?: string;
  conversionPotential?: string;
  conversationSummary?: string | null;
}

function getDailyCsvPath(): string {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  return join(LEADS_DIR, `leads-${dateStr}.csv`);
}

export async function ensureLeadsDir(): Promise<void> {
  if (!existsSync(LEADS_DIR)) {
    await mkdir(LEADS_DIR, { recursive: true });
    console.log("[Leads] Created leads directory");
  }
}

async function ensureCsvFile(csvPath: string): Promise<void> {
  await ensureLeadsDir();
  if (!existsSync(csvPath)) {
    const headerLine = CSV_HEADERS.join(",") + "\n";
    await writeFile(csvPath, headerLine, "utf8");
    console.log("[Leads] Created:", csvPath);
  }
}

export async function appendLead(lead: LeadRecord): Promise<string> {
  const csvPath = getDailyCsvPath();
  await ensureCsvFile(csvPath);

  const row = CSV_HEADERS.map((h) => {
    const key = h as keyof LeadRecord;
    return escapeCsv(lead[key] as string | undefined | null);
  }).join(",");

  await appendFile(csvPath, row + "\n", "utf8");
  console.log("[Leads] Saved to", csvPath, "- name:", lead.name, "phone:", lead.phone, "potential:", lead.conversionPotential);
  return csvPath;
}

export async function readLeads(csvPath?: string): Promise<LeadRecord[]> {
  const path = csvPath || getDailyCsvPath();
  if (!existsSync(path)) return [];
  const content = await readFile(path, "utf8");
  const lines = content.trim().split("\n");
  if (lines.length <= 1) return [];

  const records: LeadRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",");
    const record: Record<string, string> = {};
    CSV_HEADERS.forEach((h, idx) => {
      record[h] = values[idx] || "";
    });
    records.push(record as unknown as LeadRecord);
  }
  return records;
}

export async function readLatestCsv(): Promise<string | null> {
  await ensureLeadsDir();
  const path = getDailyCsvPath();
  if (!existsSync(path)) return null;
  return path;
}

export { CSV_HEADERS };
