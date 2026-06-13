import { config } from "dotenv";
import { createServer, IncomingMessage } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import { GeminiLiveSession } from "./src/lib/gemini-client";
import { appendLead, ensureLeadsDir, readLeads, readLatestCsv, CSV_HEADERS } from "./src/lib/leads-store";
import { extractLeadFromTranscript, ExtractedLead } from "./src/lib/lead-extractor";
import { readFile } from "fs/promises";
import { existsSync } from "fs";

config({ path: ".env.local" });

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  await ensureLeadsDir();

  const server = createServer(async (req, res) => {
    const parsedUrl = parse(req.url!, true);

    if (parsedUrl.pathname === "/api/leads" && req.method === "GET") {
      try {
        const leads = await readLeads();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ leads }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Failed to read leads" }));
      }
      return;
    }

    if (parsedUrl.pathname === "/api/leads/csv" && req.method === "GET") {
      try {
        const csvPath = await readLatestCsv();
        if (!csvPath || !existsSync(csvPath)) {
          res.writeHead(404);
          res.end("No leads file for today");
          return;
        }
        const content = await readFile(csvPath, "utf8");
        const filename = csvPath.split("/").pop() || "leads.csv";
        res.writeHead(200, {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename=${filename}`,
        });
        res.end(content);
      } catch (e) {
        res.writeHead(500);
        res.end("Failed to read CSV");
      }
      return;
    }

    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req: IncomingMessage, socket: any, head: Buffer) => {
    const { pathname } = parse(req.url!, true);

    if (pathname === "/ws/voice") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    }
  });

  wss.on("connection", (ws: WebSocket) => {
    console.log("[WS] Client connected");
    let geminiSession: GeminiLiveSession | null = null;

    const initGemini = async () => {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        ws.send(JSON.stringify({ type: "error", message: "GEMINI_API_KEY not configured" }));
        ws.close();
        return;
      }

      geminiSession = new GeminiLiveSession(apiKey, {
        onAudio: (base64Audio, mimeType) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "audio", data: base64Audio, mimeType }));
          }
        },
        onText: (text) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "text", content: text }));
          }
        },
        onUserTranscription: (text, finished) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "user_transcription", text, finished }));
          }
        },
        onAssistantTranscription: (text, finished) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "assistant_transcription", text, finished }));
          }
        },
        onTurnComplete: () => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "turn_complete" }));
          }
        },
        onError: (error) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "error", message: error }));
          }
        },
        onClose: () => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "session_closed" }));
          }
        },
      });

      try {
        await geminiSession.connect();
        ws.send(JSON.stringify({ type: "session_ready" }));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Connection failed";
        console.error("[Gemini] Connection failed:", message);
        ws.send(JSON.stringify({ type: "error", message }));
        ws.close();
      }
    };

    initGemini();

    ws.on("message", (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());

        switch (msg.type) {
          case "audio":
            if (geminiSession) {
              geminiSession.sendAudio(msg.data, msg.mimeType || "audio/pcm;rate=24000");
            }
            break;
          case "audio_end":
            if (geminiSession) {
              geminiSession.sendAudioStreamEnd();
            }
            break;
          case "text":
            if (geminiSession) {
              geminiSession.sendText(msg.content);
            }
            break;
          case "save_lead": {
            const apiKey = process.env.GEMINI_API_KEY;
            const transcriptText = msg.transcript || "";
            const regexLead = msg.lead || {};

            console.log("[WS] save_lead received, transcript length:", transcriptText.length);

            if (!apiKey) {
              ws.send(JSON.stringify({ type: "lead_save_error", message: "API key missing" }));
              return;
            }

            if (!transcriptText || transcriptText.trim().length < 10) {
              console.log("[WS] Transcript too short, saving with regex data only");
              const fallbackLead: any = {
                timestamp: new Date().toISOString(),
                name: regexLead.name || "",
                age: regexLead.age || "",
                phone: regexLead.phone || "",
                email: regexLead.email || "",
                stayType: regexLead.stayType || "unknown",
                checkInDate: regexLead.checkInDate || "",
                lengthOfStay: regexLead.lengthOfStay || "",
                occupancy: regexLead.occupancy || "",
                budget: regexLead.budget || "",
                interestLevel: regexLead.interestLevel || "low",
                conversionPotential: regexLead.conversionPotential || "warm",
                conversationSummary: regexLead.conversationSummary || "",
              };
              appendLead(fallbackLead).then(() => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: "lead_saved", lead: fallbackLead }));
                }
              });
              return;
            }

            console.log("[WS] Sending transcript to Gemini for extraction...");
            extractLeadFromTranscript(apiKey, transcriptText)
              .then((extracted: ExtractedLead) => {
                console.log("[WS] Gemini extraction result:", JSON.stringify(extracted));
                const record: any = {
                  timestamp: new Date().toISOString(),
                  name: extracted.name || regexLead.name || "",
                  age: extracted.age || regexLead.age || "",
                  phone: extracted.phone || regexLead.phone || "",
                  email: extracted.email || regexLead.email || "",
                  stayType: extracted.stayType || regexLead.stayType || "unknown",
                  checkInDate: extracted.checkInDate || regexLead.checkInDate || "",
                  lengthOfStay: extracted.lengthOfStay || regexLead.lengthOfStay || "",
                  occupancy: extracted.occupancy || regexLead.occupancy || "",
                  budget: extracted.budget || regexLead.budget || "",
                  interestLevel: extracted.interestLevel || regexLead.interestLevel || "low",
                  conversionPotential: extracted.conversionPotential || regexLead.conversionPotential || "warm",
                  conversationSummary: extracted.conversationSummary || regexLead.conversationSummary || "",
                };
                return appendLead(record).then(() => record);
              })
              .then((record) => {
                console.log("[Leads] Lead saved after Gemini extraction");
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: "lead_saved", lead: record }));
                }
              })
              .catch((e) => {
                console.error("[Leads] Extraction/save failed:", e);
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: "lead_save_error", message: "Failed to extract and save lead" }));
                }
              });
            break;
          }
          default:
            console.warn("[WS] Unknown message type:", msg.type);
        }
      } catch (e) {
        console.error("[WS] Failed to parse message:", e);
      }
    });

    ws.on("close", () => {
      console.log("[WS] Client disconnected");
      if (geminiSession) {
        geminiSession.close();
        geminiSession = null;
      }
    });

    ws.on("error", (err) => {
      console.error("[WS] Error:", err.message);
      if (geminiSession) {
        geminiSession.close();
        geminiSession = null;
      }
    });
  });

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WebSocket on ws://${hostname}:${port}/ws/voice`);
    console.log(`> GEMINI_API_KEY loaded: ${!!process.env.GEMINI_API_KEY}`);
  });
});
