// OpenAI Realtime Agents SDK (TypeScript, WebRTC) bridge for browser.
// This module sets up microphone → Realtime model (speech-to-speech).
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
  apiKey?: string; // Ephemeral token (required for WebRTC in browser). Can be provided at connect-time.
  model?: string;
  instructions?: string;
  /** Optional Realtime session/turn config. If omitted, SDK defaults are used. */
  sessionConfig?: Record<string, any>;
  /** Optional assistant greeting played immediately after connect. */
  autoGreetText?: string;
  onTranscript: (
    text: string,
    confidence: number,
    isFinal: boolean,
    reading: ParalinguisticReading,
    meta?: { itemId?: string }
  ) => void;
  onAssistantText?: (
    text: string,
    isFinal: boolean,
    meta?: { responseId?: string; itemId?: string }
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
    instructions: opts.instructions || "",
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
  let assistantSource: "text" | "audio_transcript" | null = null;
  let responseRequestedAt = 0;
  let transportRef: any = null;
  let pendingPostGreetTurn = false;

  const sendAssistantMessage = (text: string, voice = "marin") => {
    if (!connected || !transportRef) return;
    try {
      transportRef.sendEvent({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text }],
        },
      });
      transportRef.sendEvent({
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          audio: { voice },
        },
      });
    } catch (err) {
      console.error("assistant message failed", err);
    }
  };

  const requestResponse = (instructions?: string) => {
    if (!connected || !transportRef) return;
    const now = Date.now();
    if (now - responseRequestedAt < 500) return;
    responseRequestedAt = now;
    try {
      transportRef.sendEvent({
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          audio: { voice: "marin" },
          ...(instructions ? { instructions } : {}),
        },
      });
    } catch (err) {
      console.error("response.create failed", err);
    }
  };

  let apiKeyOverride: string | null = null;

  const connect = async () => {
    if (connected) return;

    const apiKey = apiKeyOverride || opts.apiKey;
    if (!apiKey) {
      throw new Error(
        "Ephemeral token missing. Fetch /api/realtime-token right before connect."
      );
    }

    const transport: any = (session as any).transport;
    transportRef = transport;

    // Transport events (raw Realtime events). Depending on transport, text output may come via
    // response.output_text.* or response.output_audio_transcript.*.
    (session as any).on("transport_event", (ev: any) => {
      if (!ev || !ev.type) return;
      if (ev.type === "conversation.item.input_audio_transcription.delta") {
        partialBuffer += ev.delta || "";
        lastPartialAt = Date.now();
        const reading = estimateParalinguistic(partialBuffer, 800);
        opts.onTranscript(partialBuffer, 0.7, false, reading, {
          itemId: ev.item_id,
        });
      }
      if (ev.type === "input_audio_buffer.speech_final") {
        // Use this event to advance the turn, but avoid emitting a duplicate
        // final transcript (we emit final on conversation.item.input_audio_transcription.completed).
        partialBuffer = "";
        opts.onListening();
        if (pendingPostGreetTurn) {
          pendingPostGreetTurn = false;
          requestResponse(
            "자기소개는 이미 한 번 했습니다. 바로 다음 질문으로 이어가고, 자기소개를 반복하지 마세요."
          );
        } else {
          requestResponse();
        }
      }
      if (ev.type === "conversation.item.input_audio_transcription.completed") {
        const text = ev.transcript || partialBuffer || "";
        const gap = Date.now() - lastPartialAt;
        const reading = estimateParalinguistic(text, gap);
        opts.onTranscript(text, 0.85, true, reading, { itemId: ev.item_id });
        partialBuffer = "";
        opts.onListening();
      }
      // Assistant output via audio transcript (WebRTC S2S). We ignore
      // response.output_text.* to prevent double logging.
      if (ev.type === "response.output_audio_transcript.delta") {
        if (assistantSource === null) assistantSource = "audio_transcript";
        if (assistantSource === "audio_transcript") {
          assistantBuffer += ev.delta || "";
          opts.onAssistantText?.(assistantBuffer, false, {
            responseId: ev.response_id,
            itemId: ev.item_id,
          });
        }
      }
      if (ev.type === "response.output_audio_transcript.done") {
        if (assistantSource === null) assistantSource = "audio_transcript";
        if (assistantSource === "audio_transcript") {
          const finalText = ev.transcript || assistantBuffer || "";
          opts.onAssistantText?.(finalText, true, {
            responseId: ev.response_id,
            itemId: ev.item_id,
          });
          assistantBuffer = "";
          assistantSource = null;
        }
      }
    });

    // Speaking/listening UI hooks
    (session as any).on("audio_start", () => opts.onSpeaking());
    (session as any).on("audio_stopped", () => opts.onListening());

    await session.connect({ apiKey, model });
    try {
      session.mute(true);
    } catch {
      /* noop */
    }
    connected = true;
    if (opts.autoGreetText) {
      const greetText = opts.autoGreetText;
      setTimeout(() => {
        try {
          // Update session config to ensure audio output voice is set
          transportRef?.sendEvent({
            type: "session.update",
            session: {
              output_modalities: ["audio", "text"],
              audio: { output: { voice: "marin" } },
              input_audio_transcription: {
                model: "whisper-1",
                language: "ko",
              },
            },
          });

          // Send a text message as user input (background trigger)
          session.sendMessage(greetText);

          pendingPostGreetTurn = true;

          // Trigger actual generation (speech + text)
          transportRef?.sendEvent({
            type: "response.create",
            response: {
              modalities: ["audio", "text"],
              audio: { voice: "marin" },
            },
          });
        } catch (err) {
          console.error("auto-greet sequence failed", err);
        }
      }, 200);
    }
  };

  const speak = (text: string) => {
    sendAssistantMessage(text);
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
    connectWithToken: async (apiKey: string) => {
      apiKeyOverride = apiKey;
      return connect();
    },
    speak,
    requestResponse,
    stopMic,
    startMic,
    dispose,
    triggerBargeIn,
  };
}
