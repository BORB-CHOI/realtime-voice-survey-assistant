// OpenAI Realtime Agents SDK (TypeScript, WebRTC) bridge for browser.
// This module sets up microphone → Realtime model (speech-to-speech), and
// forwards transcript events to the WS control channel.

export type ParalinguisticReading = {
  silence_ms_before: number;
  utterance_ms: number;
  hesitation: boolean;
  filler?: string[] | null;
  fatigue_score?: number | null;
};

type RealtimeClientInstance = {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  startMicrophone: () => Promise<void>;
  stopMicrophone: () => Promise<void>;
  sendText: (text: string) => void;
  on: (event: string, handler: (data: any) => void) => void;
};

// Lightweight paralinguistic estimator (client-side placeholder)
function estimateParalinguistic(text: string, lastTurnMs: number): ParalinguisticReading {
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
  let client: RealtimeClientInstance | null = null;
  let connected = false;
  let lastPartialAt = Date.now();

  const loadClient = async () => {
    if (client) return client;
    try {
      // Agents SDK for TypeScript (browser, WebRTC). Ensure dependency installed.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = await import("@openai/realtime-api-beta");
      const { RealtimeClient } = mod as any;
      // sessionConfig is optional; if not provided, SDK defaults apply.
      const baseConfig: Record<string, any> = { apiKey: opts.apiKey, model };
      if (opts.sessionConfig) {
        baseConfig.session = opts.sessionConfig;
      }
      client = new RealtimeClient(baseConfig);
      return client;
    } catch (err) {
      console.error("Failed to load Realtime SDK", err);
      throw err;
    }
  };

  const connect = async () => {
    const c = await loadClient();
    if (connected) return;
    // Wire transcript events
    c.on("transcript.partial", (ev: any) => {
      lastPartialAt = Date.now();
      const reading = estimateParalinguistic(ev.text || "", 800);
      opts.onTranscript(ev.text || "", ev.confidence ?? 0.7, false, reading);
    });
    c.on("transcript.final", (ev: any) => {
      const now = Date.now();
      const gap = now - lastPartialAt;
      const reading = estimateParalinguistic(ev.text || "", gap);
      opts.onTranscript(ev.text || "", ev.confidence ?? 0.8, true, reading);
      opts.onListening();
    });
    // Audio start/stop hooks
    c.on("input_audio_buffer.speech_started", () => opts.onSpeaking());
    c.on("input_audio_buffer.speech_stopped", () => opts.onListening());
    await c.connect();
    await c.startMicrophone();
    connected = true;
  };

  const speak = (text: string) => {
    // Use model TTS via Realtime conversation item
    if (!client || !connected) return;
    try {
      (client as any).send({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text }],
        },
      });
      (client as any).send({ type: "response.create" });
    } catch (err) {
      console.error("speak failed", err);
    }
  };

  const stopMic = async () => {
    if (client) {
      await client.stopMicrophone?.();
    }
  };

  const dispose = async () => {
    if (client) {
      await client.stopMicrophone?.();
      await client.disconnect?.();
      connected = false;
    }
  };

  // Expose a manual user barge-in trigger if needed
  const triggerBargeIn = () => opts.onUserBargeIn();

  return { connect, speak, stopMic, dispose, triggerBargeIn };
}
