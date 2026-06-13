import {
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  Session,
} from "@google/genai";
import { SYSTEM_PROMPT } from "./system-prompt";

const MODEL = "models/gemini-3.1-flash-live-preview";

export interface GeminiSessionCallbacks {
  onAudio: (base64Audio: string, mimeType: string) => void;
  onText: (text: string) => void;
  onTurnComplete: () => void;
  onError: (error: string) => void;
  onClose: () => void;
  onUserTranscription: (text: string, finished: boolean) => void;
  onAssistantTranscription: (text: string, finished: boolean) => void;
}

export class GeminiLiveSession {
  private ai: GoogleGenAI;
  private session: Session | null = null;
  private callbacks: GeminiSessionCallbacks;

  constructor(apiKey: string, callbacks: GeminiSessionCallbacks) {
    console.log("[GeminiClient] Constructing with API key length:", apiKey?.length || 0);
    this.ai = new GoogleGenAI({ apiKey });
    this.callbacks = callbacks;
  }

  async connect(): Promise<void> {
    console.log("[GeminiClient] Connecting to model:", MODEL);
    this.session = await this.ai.live.connect({
      model: MODEL,
      callbacks: {
        onopen: () => {
          console.log("[Gemini] Session opened");
        },
        onmessage: (message: LiveServerMessage) => {
          this.handleMessage(message);
        },
        onerror: (e: ErrorEvent) => {
          console.error("[Gemini] Error:", e.message);
          this.callbacks.onError(e.message);
        },
        onclose: (e: CloseEvent) => {
          console.log("[Gemini] Closed:", e.reason);
          this.callbacks.onClose();
        },
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: "Sulafat",
            },
          },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        contextWindowCompression: {
          triggerTokens: "104857",
          slidingWindow: { targetTokens: "52428" },
        },
      },
    });

    this.session.sendClientContent({
      turns: [{ role: "user", parts: [{ text: SYSTEM_PROMPT }] }],
      turnComplete: true,
    });
    console.log("[GeminiClient] System prompt sent, session ready");
  }

  private handleMessage(message: LiveServerMessage): void {
    if (!message.serverContent) return;

    const parts = message.serverContent.modelTurn?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          console.log("[GeminiClient] Audio chunk received, size:", part.inlineData.data.length, "mime:", part.inlineData.mimeType);
          this.callbacks.onAudio(part.inlineData.data, part.inlineData.mimeType ?? "audio/pcm;rate=24000");
        }
        if (part.text) {
          console.log("[GeminiClient] Text received:", part.text.substring(0, 100));
          this.callbacks.onText(part.text);
        }
      }
    }

    if (message.serverContent.inputTranscription) {
      const t = message.serverContent.inputTranscription;
      if (t.text) {
        console.log("[GeminiClient] User transcription:", t.text, "finished:", t.finished);
        this.callbacks.onUserTranscription(t.text, t.finished ?? false);
      }
    }

    if (message.serverContent.outputTranscription) {
      const t = message.serverContent.outputTranscription;
      if (t.text) {
        console.log("[GeminiClient] Assistant transcription:", t.text, "finished:", t.finished);
        this.callbacks.onAssistantTranscription(t.text, t.finished ?? false);
      }
    }

    if (message.serverContent.turnComplete) {
      console.log("[GeminiClient] Turn complete");
      this.callbacks.onTurnComplete();
    }
  }

  sendAudio(base64Audio: string, mimeType: string = "audio/pcm;rate=24000"): void {
    if (!this.session) return;
    this.session.sendRealtimeInput({
      audio: {
        data: base64Audio,
        mimeType,
      },
    });
  }

  sendAudioStreamEnd(): void {
    if (!this.session) return;
    this.session.sendRealtimeInput({
      audioStreamEnd: true,
    });
  }

  sendText(text: string): void {
    if (!this.session) return;
    this.session.sendClientContent({
      turns: [{ role: "user", parts: [{ text }] }],
      turnComplete: true,
    });
  }

  close(): void {
    if (this.session) {
      this.session.close();
      this.session = null;
    }
  }
}
