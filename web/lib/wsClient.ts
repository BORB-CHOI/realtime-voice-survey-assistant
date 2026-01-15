export type ClientMessage =
  | { type: "hello"; payload: { clientVersion?: string } }
  | {
      type: "asr_partial" | "asr_final";
      payload: {
        asr: { text: string; confidence: number; final: boolean };
        paralinguistic: ParalinguisticReading;
      };
    }
  | { type: "user_bargein"; payload: { reason: "interrupt" | "clarify" } }
  | { type: "frontend_event"; payload: { state: "listening" | "processing" | "speaking" } };

export type ServerMessage =
  | { type: "session_created"; payload: { sessionId: string } }
  | { type: "ask" | "clarify"; payload: { utterance: string; state?: string; hint?: string | null } }
  | { type: "end"; payload: { reason: string } }
  | { type: "summary"; payload: { summary: any } }
  | { type: "error"; payload: { code: string; message?: string } }
  | { type: "ack"; payload: any };

export type ParalinguisticReading = {
  silence_ms_before: number;
  utterance_ms: number;
  hesitation: boolean;
  filler?: string[] | null;
  fatigue_score?: number | null;
};

export function createWsClient(url: string, onMessage: (msg: ServerMessage) => void) {
  let socket: WebSocket | null = null;

  const connect = () => {
    socket = new WebSocket(url);
    socket.onopen = () => {
      /* no-op */
    };
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data as ServerMessage);
      } catch (e) {
        console.error("WS parse error", e);
      }
    };
    socket.onclose = () => {
      socket = null;
    };
  };

  const send = (msg: ClientMessage) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(msg));
  };

  const close = () => {
    socket?.close();
    socket = null;
  };

  return { connect, send, close };
}
