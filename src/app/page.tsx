"use client";

import { useEffect } from "react";
import { useVoiceCall } from "@/lib/use-voice-call";
import { LeadData } from "@/lib/lead-parser";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function CallButton({
  callStatus,
  onStart,
  onEnd,
}: {
  callStatus: string;
  onStart: () => void;
  onEnd: () => void;
}) {
  const isActive = callStatus === "connected" || callStatus === "connecting";

  const handleClick = () => {
    console.log("[CallButton] clicked, callStatus:", callStatus, "isActive:", isActive);
    if (isActive) {
      onEnd();
    } else {
      console.log("[CallButton] calling onStart...");
      onStart();
      console.log("[CallButton] onStart called");
    }
  };

  return (
    <button
      onClick={handleClick}
      onPointerDown={() => console.log("[CallButton] pointerDown")}
      className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl transition-all duration-300 shadow-lg cursor-pointer ${
        isActive
          ? "bg-red-500 hover:bg-red-600 animate-pulse"
          : "bg-emerald-500 hover:bg-emerald-600 hover:scale-105"
      }`}
    >
      {callStatus === "connecting" ? (
        <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      ) : isActive ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-white">
          <path fillRule="evenodd" d="M3.75 3.75a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-.75.75h-.75v1.5a3 3 0 0 0 3 3h1.5v-.75a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-.75.75h-1.5A8.25 8.25 0 0 1 3.75 9v-1.5h-.75A.75.75 0 0 1 3.75 3.75Z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-white">
          <path fillRule="evenodd" d="M1.5 5.25a3.75 3.75 0 0 1 3.75-3.75h1.5a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-.75.75h-1.5a2.25 2.25 0 0 0 2.25 2.25h1.5a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-.75.75h-1.5A3.75 3.75 0 0 1 1.5 9.75v-4.5ZM15 2.25a.75.75 0 0 1 .75-.75h1.5a3.75 3.75 0 0 1 3.75 3.75v4.5a3.75 3.75 0 0 1-3.75 3.75h-1.5a.75.75 0 0 1-.75-.75v-3a.75.75 0 0 1 .75-.75h1.5a2.25 2.25 0 0 0-2.25-2.25h-1.5a.75.75 0 0 1-.75-.75v-3Z" clipRule="evenodd" />
        </svg>
      )}
    </button>
  );
}

function MuteButton({ isMuted, onToggle }: { isMuted: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer ${
        isMuted ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {isMuted ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.858A10.46 10.46 0 0 0 1.5 12c0 .898.121 1.768.35 2.594.34 1.194 1.517 1.858 2.658 1.858h1.932l4.5 4.5c.944.945 2.56.276 2.56-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c2.088 2.088 3.106 5.067 3.106 7.894s-1.018 5.806-3.106 7.894a.75.75 0 0 1-1.06-1.06C19.815 17.462 20.5 15.165 20.5 13s-.685-4.462-1.916-5.834a.75.75 0 0 1 0-1.06Z" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.858A10.46 10.46 0 0 0 1.5 12c0 .898.121 1.768.35 2.594.34 1.194 1.517 1.858 2.658 1.858h1.932l4.5 4.5c.944.945 2.56.276 2.56-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c2.088 2.088 3.106 5.067 3.106 7.894s-1.018 5.806-3.106 7.894a.75.75 0 0 1-1.06-1.06C19.815 17.462 20.5 15.165 20.5 13s-.685-4.462-1.916-5.834a.75.75 0 0 1 0-1.06ZM15.564 8.126a.75.75 0 0 1 1.06 0A5.976 5.976 0 0 1 18.5 13a5.976 5.976 0 0 1-1.876 4.874.75.75 0 0 1-1.06-1.06A4.476 4.476 0 0 0 16.75 13a4.476 4.476 0 0 0-1.186-3.814.75.75 0 0 1 0-1.06Z" />
        </svg>
      )}
    </button>
  );
}

function AudioVisualizer({ isActive, isSpeaking }: { isActive: boolean; isSpeaking: boolean }) {
  if (!isActive) return null;

  const barHeights = [24, 40, 32, 48, 36, 44, 28];

  return (
    <div className="flex items-center justify-center gap-1 h-16">
      {barHeights.map((baseHeight, i) => (
        <div
          key={i}
          className={`w-1.5 rounded-full transition-all duration-300 ${
            isSpeaking ? "bg-emerald-400" : "bg-blue-400"
          }`}
          style={{
            height: isSpeaking
              ? `${baseHeight}px`
              : `${8 + Math.sin(i * 0.8) * 6}px`,
            animation: isActive
              ? `barAnim ${0.4 + i * 0.1}s ease-in-out infinite alternate`
              : "none",
          }}
        />
      ))}
    </div>
  );
}

function LeadPanel({ lead, onSave, callStatus }: { lead: LeadData; onSave: () => void; callStatus: string }) {
  const hasData = lead.name || lead.phone || lead.email || lead.stayType !== "unknown";
  const isInCall = callStatus === "connected" || callStatus === "connecting";

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
          Lead Information
        </h3>
        <a
          href="/api/leads/csv"
          className="text-xs text-blue-600 hover:text-blue-800 underline"
        >
          Download CSV
        </a>
      </div>
      {!hasData ? (
        <p className="text-gray-400 text-sm italic">No lead data captured yet</p>
      ) : (
        <div className="space-y-2">
          {lead.name && (
            <div className="flex justify-between">
              <span className="text-gray-500 text-sm">Name</span>
              <span className="text-gray-900 text-sm font-medium">{lead.name}</span>
            </div>
          )}
          {lead.phone && (
            <div className="flex justify-between">
              <span className="text-gray-500 text-sm">Phone</span>
              <span className="text-gray-900 text-sm font-medium">{lead.phone}</span>
            </div>
          )}
          {lead.email && (
            <div className="flex justify-between">
              <span className="text-gray-500 text-sm">Email</span>
              <span className="text-gray-900 text-sm font-medium">{lead.email}</span>
            </div>
          )}
          {lead.age && (
            <div className="flex justify-between">
              <span className="text-gray-500 text-sm">Age</span>
              <span className="text-gray-900 text-sm font-medium">{lead.age}</span>
            </div>
          )}
          {lead.stayType && lead.stayType !== "unknown" && (
            <div className="flex justify-between">
              <span className="text-gray-500 text-sm">Stay Type</span>
              <span className="text-gray-900 text-sm font-medium capitalize">{lead.stayType}</span>
            </div>
          )}
          {lead.checkInDate && (
            <div className="flex justify-between">
              <span className="text-gray-500 text-sm">Check-in</span>
              <span className="text-gray-900 text-sm font-medium">{lead.checkInDate}</span>
            </div>
          )}
          <div className="pt-2 border-t border-gray-100">
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-sm">Interest</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  lead.interestLevel === "high"
                    ? "bg-green-100 text-green-700"
                    : lead.interestLevel === "medium"
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {lead.interestLevel}
              </span>
            </div>
          </div>
          {lead.conversionPotential && (
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-sm">Conversion</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  lead.conversionPotential === "hot"
                    ? "bg-red-100 text-red-700"
                    : lead.conversionPotential === "warm"
                    ? "bg-orange-100 text-orange-700"
                    : "bg-blue-100 text-blue-600"
                }`}
              >
                {lead.conversionPotential}
              </span>
            </div>
          )}
          {isInCall && (
            <div className="pt-2 border-t border-gray-100">
              <button
                onClick={onSave}
                className="w-full text-xs bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 cursor-pointer"
              >
                Save Lead Now
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TranscriptPanel({ transcript }: { transcript: { role: string; text: string; timestamp: number }[] }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex-1 min-h-0 overflow-hidden flex flex-col">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Transcript
      </h3>
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {transcript.length === 0 ? (
          <p className="text-gray-400 text-sm italic">Conversation will appear here</p>
        ) : (
          transcript.map((entry, i) => (
            <div key={i} className={`flex ${entry.role === "assistant" ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${
                  entry.role === "assistant"
                    ? "bg-gray-100 text-gray-800"
                    : "bg-blue-500 text-white"
                }`}
              >
                {entry.text}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function HomePage() {
  const {
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
  } = useVoiceCall();

  const isActive = callStatus === "connected" || callStatus === "connecting";

  useEffect(() => {
    console.log("[HomePage] mounted, callStatus:", callStatus);
  }, []);

  useEffect(() => {
    console.log("[HomePage] callStatus changed:", callStatus);
  }, [callStatus]);

  useEffect(() => {
    console.log("[HomePage] error changed:", error);
  }, [error]);

  const handleStartCall = () => {
    console.log("[HomePage] handleStartCall called, current callStatus:", callStatus);
    startCall();
  };

  const handleEndCall = () => {
    console.log("[HomePage] handleEndCall called");
    endCall();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
              C
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Colive Pune</h1>
              <p className="text-xs text-gray-500">Voice Receptionist</p>
            </div>
          </div>
          {isActive && (
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${callStatus === "connected" ? "bg-green-500" : "bg-yellow-500 animate-pulse"}`} />
              <span className="text-sm font-mono text-gray-600">{formatDuration(callDuration)}</span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col items-center">
              <div className="mb-4 text-center">
                <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-3">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-blue-600">
                    <path fillRule="evenodd" d="M1.5 5.25a3.75 3.75 0 0 1 3.75-3.75h1.5a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-.75.75h-1.5a2.25 2.25 0 0 0 2.25 2.25h1.5a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-.75.75h-1.5A3.75 3.75 0 0 1 1.5 9.75v-4.5ZM15 2.25a.75.75 0 0 1 .75-.75h1.5a3.75 3.75 0 0 1 3.75 3.75v4.5a3.75 3.75 0 0 1-3.75 3.75h-1.5a.75.75 0 0 1-.75-.75v-3a.75.75 0 0 1 .75-.75h1.5a2.25 2.25 0 0 0-2.25-2.25h-1.5a.75.75 0 0 1-.75-.75v-3Z" clipRule="evenodd" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-gray-900">Sarah — Front Desk</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {callStatus === "idle" && "Click to start a voice call"}
                  {callStatus === "connecting" && "Connecting..."}
                  {callStatus === "connected" && "Call in progress"}
                  {callStatus === "error" && "Connection failed"}
                  {callStatus === "ended" && "Call ended — click to call again"}
                </p>
              </div>

              <AudioVisualizer isActive={isActive} isSpeaking={isSpeaking} />

              <div className="flex items-center gap-4 mt-6">
                {isActive && <MuteButton isMuted={isMuted} onToggle={toggleMute} />}
                <CallButton callStatus={callStatus} onStart={handleStartCall} onEnd={handleEndCall} />
              </div>

              {error && (
                <p className="mt-4 text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg">{error}</p>
              )}
            </div>

            <TranscriptPanel transcript={transcript} />
          </div>

          <div className="flex flex-col gap-6">
            <LeadPanel lead={lead} onSave={saveLeadManually} callStatus={callStatus} />

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Quick Info
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Daily Stay</span>
                  <span className="text-gray-900 font-medium">₹1,000/night</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Monthly Stay</span>
                  <span className="text-gray-900 font-medium">₹30,000/30 days</span>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-gray-100">
                <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Amenities</h4>
                <div className="flex flex-wrap gap-1.5">
                  {["WiFi", "Furnished", "Housekeeping", "Laundry", "Security", "Coworking", "Power Backup"].map((a) => (
                    <span key={a} className="text-xs bg-gray-50 text-gray-600 px-2 py-1 rounded-md">{a}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
