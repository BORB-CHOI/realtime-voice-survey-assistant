// OpenAI Realtime Agents SDK (TypeScript, WebRTC) bridge for browser.
// This module sets up microphone → Realtime model (speech-to-speech), and
// forwards transcript events to the WS control channel.
import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";

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
  apiKey: string;
  model?: string;
  /** Optional Realtime session/turn config. If omitted, SDK defaults are used. */
  sessionConfig?: Record<string, any>;
  onTranscript: (
    text: string,
    confidence: number,
    isFinal: boolean,
    reading: ParalinguisticReading
  ) => void;
  onUserBargeIn: () => void;
  onSpeaking: () => void;
  onListening: () => void;
}) {
  const model =
    opts.model ||
    process.env.NEXT_PUBLIC_REALTIME_MODEL ||
    "gpt-4o-realtime-preview";
  const agent = new RealtimeAgent({
    name: "assistant",
    instructions: "You are a helpful assistant.",
  });

  const session = new RealtimeSession(agent, {
    transport: "webrtc",
    model,
    config: opts.sessionConfig,
  });

  let connected = false;
  let partialBuffer = "";
  let lastPartialAt = Date.now();

  const connect = async () => {
    if (connected) return;

    // Transcript events via transport_event (covers partial deltas and final transcripts)
    session.on("transport_event", (ev: any) => {
      if (!ev || !ev.type) return;
      if (ev.type === "audio_transcript_delta") {
        partialBuffer += ev.delta || "";
        lastPartialAt = Date.now();
        const reading = estimateParalinguistic(partialBuffer, 800);
        opts.onTranscript(partialBuffer, 0.7, false, reading);
      }
      if (ev.type === "conversation.item.input_audio_transcription.completed") {
        const text = ev.transcript || partialBuffer || "";
        const gap = Date.now() - lastPartialAt;
        const reading = estimateParalinguistic(text, gap);
        opts.onTranscript(text, 0.85, true, reading);
        partialBuffer = "";
        opts.onListening();
      }
    });

    // Speaking/listening UI hooks
    session.on("audio_start", () => opts.onSpeaking());
    session.on("audio_stopped", () => opts.onListening());

    await session.connect({ apiKey: opts.apiKey, model });
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
      transport.sendEvent({ type: "response.create" });
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

  return { connect, speak, stopMic, dispose, triggerBargeIn };
}
