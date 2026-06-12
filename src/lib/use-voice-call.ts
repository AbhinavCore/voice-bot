"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { LeadData, createEmptyLead, parseLeadFromText, buildConversationSummary } from "@/lib/lead-parser";
import { float32ToInt16, arrayBufferToBase64, int16ToFloat32 } from "@/lib/audio-utils";

type CallStatus = "idle" | "connecting" | "connected" | "error" | "ended";

interface TranscriptEntry {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function cleanupResources(
  processorRef: React.MutableRefObject<ScriptProcessorNode | null>,
  sourceRef: React.MutableRefObject<MediaStreamAudioSourceNode | null>,
  audioContextRef: React.MutableRefObject<AudioContext | null>,
  micStreamRef: React.MutableRefObject<MediaStream | null>,
  playbackContextRef: React.MutableRefObject<AudioContext | null>,
  wsRef: React.MutableRefObject<WebSocket | null>,
  nextPlayTimeRef: React.MutableRefObject<number>,
  timerRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>,
  recognitionRef: React.MutableRefObject<SpeechRecognitionInstance | null>
) {
  console.log("[Call] cleanupResources");
  try { processorRef.current?.disconnect(); } catch {}
  try { sourceRef.current?.disconnect(); } catch {}
  try { audioContextRef.current?.close(); } catch {}
  try { micStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
  try { playbackContextRef.current?.close(); } catch {}
  try { recognitionRef.current?.stop(); } catch {}
  try { recognitionRef.current?.abort(); } catch {}
  try { wsRef.current?.close(); } catch {}

  processorRef.current = null;
  sourceRef.current = null;
  audioContextRef.current = null;
  micStreamRef.current = null;
  playbackContextRef.current = null;
  recognitionRef.current = null;
  wsRef.current = null;
  nextPlayTimeRef.current = 0;

  if (timerRef.current) {
    clearInterval(timerRef.current);
    timerRef.current = null;
  }
}

export function useVoiceCall() {
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lead, setLead] = useState<LeadData>(createEmptyLead());
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextPlayTimeRef = useRef(0);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const geminiSampleRateRef = useRef(24000);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMutedRef = useRef(false);
  const inCallRef = useRef(false);
  const leadRef = useRef<LeadData>(createEmptyLead());
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const playAudioChunk = useCallback((pcmData: ArrayBuffer, sampleRate: number) => {
    if (!playbackContextRef.current) {
      playbackContextRef.current = new AudioContext({ sampleRate });
    }

    const ctx = playbackContextRef.current;
    const int16 = new Int16Array(pcmData);
    const float32 = int16ToFloat32(int16);
    const buffer = ctx.createBuffer(1, float32.length, sampleRate);
    buffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    if (nextPlayTimeRef.current < now) {
      nextPlayTimeRef.current = now;
    }
    source.start(nextPlayTimeRef.current);
    nextPlayTimeRef.current += buffer.duration;

    source.onended = () => {
      setIsSpeaking(false);
    };
    setIsSpeaking(true);
  }, []);

  const sendLeadToServer = useCallback(() => {
    const currentLead = leadRef.current;
    const transcriptText = buildConversationSummary(transcriptRef.current);
    const hasTranscript = transcriptRef.current.length > 0;
    const hasData = currentLead.name || currentLead.phone || currentLead.email;
    console.log("[Call] sendLeadToServer, hasData:", hasData, "hasTranscript:", hasTranscript);

    if (!hasData && !hasTranscript) {
      console.log("[Call] No lead data or transcript to save");
      return;
    }

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn("[Call] WS not open, cannot save lead. readyState:", ws?.readyState);
      return;
    }

    ws.send(JSON.stringify({
      type: "save_lead",
      lead: currentLead,
      transcript: transcriptText,
    }));
    console.log("[Call] save_lead sent to server, transcript length:", transcriptText.length);
  }, []);

  const startSpeechRecognition = useCallback(() => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      console.warn("[STT] Browser SpeechRecognition not available");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-IN";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0].transcript.trim();
          if (text) {
            console.log("[STT] User said:", text);
            const entry: TranscriptEntry = { role: "user", text, timestamp: Date.now() };
            transcriptRef.current = [...transcriptRef.current, entry];
            setTranscript([...transcriptRef.current]);

            const updatedLead = parseLeadFromText(text, leadRef.current);
            leadRef.current = updatedLead;
            setLead(updatedLead);
            console.log("[STT] Lead updated:", updatedLead);
          }
        }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.warn("[STT] Error:", event.error);
      if (event.error === "no-speech" || event.error === "aborted") return;
    };

    recognition.onend = () => {
      if (inCallRef.current && recognitionRef.current) {
        console.log("[STT] Restarting recognition");
        try { recognition.start(); } catch {}
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
      console.log("[STT] SpeechRecognition started");
    } catch (e) {
      console.error("[STT] Failed to start:", e);
    }
  }, []);

  const startCall = useCallback(async () => {
    if (inCallRef.current) {
      console.log("[Call] Already in call, ignoring");
      return;
    }

    console.log("[Call] startCall triggered");
    inCallRef.current = true;

    try {
      setError(null);
      setCallStatus("connecting");
      setTranscript([]);
      setLead(createEmptyLead());
      leadRef.current = createEmptyLead();
      transcriptRef.current = [];

      console.log("[Call] Requesting microphone access...");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      micStreamRef.current = stream;
      console.log("[Call] Microphone access granted");

      const audioContext = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = float32ToInt16(inputData);
        const base64 = arrayBufferToBase64(pcm16.buffer);

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && !isMutedRef.current) {
          wsRef.current.send(
            JSON.stringify({
              type: "audio",
              data: base64,
              mimeType: "audio/pcm;rate=24000",
            })
          );
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${wsProtocol}//${window.location.host}/ws/voice`;
      console.log("[Call] Connecting WebSocket to:", wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[Call] WebSocket open");
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data);
          console.log("[Call] WS message:", msg.type);

          switch (msg.type) {
            case "session_ready":
              console.log("[Call] Gemini session ready!");
              setCallStatus("connected");
              setCallDuration(0);
              timerRef.current = setInterval(() => {
                setCallDuration((d) => d + 1);
              }, 1000);
              startSpeechRecognition();
              break;

            case "audio": {
              const pcmBase64 = msg.data as string;
              const mimeType = msg.mimeType as string;

              const rateMatch = mimeType.match(/rate=(\d+)/);
              if (rateMatch) {
                geminiSampleRateRef.current = parseInt(rateMatch[1], 10);
              }

              const binaryStr = atob(pcmBase64);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
              }
              playAudioChunk(bytes.buffer, geminiSampleRateRef.current);
              break;
            }

            case "turn_complete":
              console.log("[Call] Turn complete");
              break;

            case "error":
              console.error("[Call] Server error:", msg.message);
              setError(msg.message);
              setCallStatus("error");
              inCallRef.current = false;
              break;

            case "session_closed":
              console.log("[Call] Session closed by server");
              setCallStatus("ended");
              inCallRef.current = false;
              if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
              }
              break;

            case "lead_saved":
              console.log("[Call] Lead saved to CSV:", msg.lead);
              break;

            case "lead_save_error":
              console.error("[Call] Lead save error:", msg.message);
              break;
          }
        } catch (e) {
          console.error("[Call] Failed to parse WS message:", e);
        }
      };

      ws.onerror = (e) => {
        console.error("[Call] WebSocket error:", e);
        setError("WebSocket connection failed");
        setCallStatus("error");
        inCallRef.current = false;
      };

      ws.onclose = () => {
        console.log("[Call] WebSocket closed");
        if (inCallRef.current) {
          sendLeadToServer();
          setCallStatus("ended");
          inCallRef.current = false;
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          setTimeout(() => {
            setCallStatus("idle");
          }, 2000);
        }
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to start call";
      console.error("[Call] startCall error:", message);
      setError(message);
      setCallStatus("error");
      inCallRef.current = false;
    }
  }, [playAudioChunk, sendLeadToServer, startSpeechRecognition]);

  const endCall = useCallback(() => {
    console.log("[Call] endCall triggered");
    inCallRef.current = false;

    sendLeadToServer();

    setTimeout(() => {
      cleanupResources(
        processorRef, sourceRef, audioContextRef,
        micStreamRef, playbackContextRef, wsRef,
        nextPlayTimeRef, timerRef, recognitionRef
      );
      setCallStatus("ended");

      setTimeout(() => {
        setCallStatus("idle");
      }, 2000);
    }, 300);
  }, [sendLeadToServer]);

  const saveLeadManually = useCallback(() => {
    console.log("[Call] Manual save lead triggered");
    sendLeadToServer();
  }, [sendLeadToServer]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      isMutedRef.current = next;
      console.log("[Call] Mute:", next);
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      console.log("[Call] Component unmounting, cleaning up");
      inCallRef.current = false;
      cleanupResources(
        processorRef, sourceRef, audioContextRef,
        micStreamRef, playbackContextRef, wsRef,
        nextPlayTimeRef, timerRef, recognitionRef
      );
    };
  }, []);

  return {
    callStatus,
    isMuted,
    isSpeaking,
    lead,
    transcript,
    error,
    callDuration,
    startCall,
    endCall,
    toggleMute,
    saveLeadManually,
  };
}
