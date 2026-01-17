// OpenAI Realtime Agents SDK (TypeScript, WebRTC) bridge for browser.
// This module sets up microphone → Realtime model (speech-to-speech).
import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";
import { SYSTEM_PROMPT } from "./systemPrompt";

export type ParalinguisticReading = {
  silence_ms_before: number;
  utterance_ms: number;
  hesitation: boolean;
  filler?: string[] | null;
  fatigue_score?: number | null;
};

// Lightweight paralinguistic estimator (client-side placeholder)
function estimateParalinguistic(
  text: string,
  lastTurnMs: number
): ParalinguisticReading {
  const hesitationTokens = ["음", "어", "글쎄", "저기"];
  const filler = hesitationTokens.filter((t) => text.includes(t));
  return {
    silence_ms_before: Math.min(lastTurnMs, 8000),
    utterance_ms: Math.min(Math.max(text.length * 120, 400), 12000),
    hesitation: filler.length > 0,
    filler: filler.length ? filler : null,
    fatigue_score: null,
  };
}

export function createRealtimeClient(opts: {
  apiKey: string; // Ephemeral token (required for WebRTC in browser).
  model?: string;
  /** Optional Realtime session/turn config. If omitted, SDK defaults are used. */
  sessionConfig?: Record<string, any>;
  onTranscript: (
    text: string,
    confidence: number,
    isFinal: boolean,
    reading: ParalinguisticReading
  ) => void;
  onAssistantText?: (text: string, isFinal: boolean) => void;
  onUserBargeIn: () => void;
  onSpeaking: () => void;
  onListening: () => void;
}) {
  const model =
    opts.model ||
    process.env.NEXT_PUBLIC_REALTIME_MODEL ||
    "gpt-realtime";
  const agent = new RealtimeAgent({
    name: "assistant",
    instructions: SYSTEM_PROMPT,
  });

  const session = new RealtimeSession(agent, {
    transport: "webrtc",
    model,
    config: opts.sessionConfig,
  });

  let connected = false;
  let partialBuffer = "";
  let lastPartialAt = Date.now();
  let assistantBuffer = "";
  let responseRequestedAt = 0;

  const connect = async () => {
    if (connected) return;

    const apiKey = opts.apiKey;

    const transport: any = (session as any).transport;
    const requestResponse = (instructions?: string) => {
      const now = Date.now();
      if (now - responseRequestedAt < 500) return;
      responseRequestedAt = now;
      try {
        transport.sendEvent({
          type: "response.create",
          response: {
            output_modalities: ["audio"],
            audio: { voice: "marin" },
            ...(instructions ? { instructions } : {}),
          },
        });
      } catch (err) {
        console.error("response.create failed", err);
      }
    };

    // Transcript events via transport_event (covers partial deltas and final transcripts)
    session.on("transport_event", (ev: any) => {
      if (!ev || !ev.type) return;
      if (ev.type === "audio_transcript_delta") {
        partialBuffer += ev.delta || "";
        lastPartialAt = Date.now();
        const reading = estimateParalinguistic(partialBuffer, 800);
        opts.onTranscript(partialBuffer, 0.7, false, reading);
      }
      if (ev.type === "input_audio_buffer.speech_final") {
        const text = ev.transcript || partialBuffer || "";
        const gap = Date.now() - lastPartialAt;
        const reading = estimateParalinguistic(text, gap);
        opts.onTranscript(text, 0.85, true, reading);
        partialBuffer = "";
        opts.onListening();
        requestResponse();
      }
      if (ev.type === "conversation.item.input_audio_transcription.completed") {
        const text = ev.transcript || partialBuffer || "";
        const gap = Date.now() - lastPartialAt;
        const reading = estimateParalinguistic(text, gap);
        opts.onTranscript(text, 0.85, true, reading);
        partialBuffer = "";
        opts.onListening();
      }
      if (ev.type === "response.output_text.delta") {
        assistantBuffer += ev.delta || "";
        opts.onAssistantText?.(assistantBuffer, false);
      }
      if (ev.type === "response.output_text.done") {
        const finalText = ev.text || assistantBuffer || "";
        opts.onAssistantText?.(finalText, true);
        assistantBuffer = "";
      }
    });

    // Speaking/listening UI hooks
    session.on("audio_start", () => opts.onSpeaking());
    session.on("audio_stopped", () => opts.onListening());

    await session.connect({ apiKey, model });
    connected = true;
  };

  const speak = (text: string) => {
    if (!connected) return;
    try {
      // Send a pre-authored assistant message so TTS is played without LLM generation.
      const transport: any = (session as any).transport;
      transport.sendEvent({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text }],
        },
      });
      transport.sendEvent({
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          audio: { voice: "alloy" },
        },
      });
    } catch (err) {
      console.error("speak failed", err);
    }
  };

  const stopMic = async () => {
    try {
      session.mute(true);
    } catch {
      /* noop */
    }
  };

  const startMic = async () => {
    try {
      session.mute(false);
    } catch (err) {
      console.error("unmute failed", err);
    }
  };

  const dispose = async () => {
    try {
      session.close();
    } finally {
      connected = false;
    }
  };

  const triggerBargeIn = () => {
    try {
      session.interrupt();
    } catch (err) {
      console.error("interrupt failed", err);
    }
    opts.onUserBargeIn();
  };

  return {
    connect,
    speak,
    requestResponse,
    stopMic,
    startMic,
    dispose,
    triggerBargeIn,
  };
}
