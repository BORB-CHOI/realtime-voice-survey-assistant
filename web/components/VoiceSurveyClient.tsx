"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createWsClient, type ClientMessage, type ServerMessage } from "../lib/wsClient";
import { createRealtimeClient, type ParalinguisticReading } from "../lib/realtimeClient";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";
const REALTIME_API_KEY = process.env.NEXT_PUBLIC_REALTIME_API_KEY || ""; // TODO: 주입

export default function VoiceSurveyClient() {
  const [connected, setConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "listening" | "processing" | "speaking">("idle");
  const [log, setLog] = useState<string[]>([]);
  const [summary, setSummary] = useState<any>(null);

  const wsRef = useRef<ReturnType<typeof createWsClient> | null>(null);
  const rtRef = useRef<ReturnType<typeof createRealtimeClient> | null>(null);

  const appendLog = (line: string) => setLog((prev) => [...prev.slice(-100), line]);

  // Handle incoming WS messages
  const handleServerMessage = (msg: ServerMessage) => {
    if (msg.type === "session_created") {
      setSessionId(msg.payload.sessionId);
      appendLog(`session created: ${msg.payload.sessionId}`);
      return;
    }
    if (msg.type === "ask" || msg.type === "clarify") {
      setStatus("speaking");
      const utter = msg.payload.utterance;
      appendLog(`${msg.type}: ${utter}`);
      rtRef.current?.speak(utter);
      return;
    }
    if (msg.type === "end") {
      appendLog(`end: ${msg.payload.reason}`);
      setStatus("idle");
      return;
    }
    if (msg.type === "summary") {
      setSummary(msg.payload.summary);
      appendLog("summary received");
      return;
    }
    if (msg.type === "error") {
      appendLog(`error: ${msg.payload.code}`);
      return;
    }
  };

  useEffect(() => {
    const ws = createWsClient(WS_URL, handleServerMessage);
    wsRef.current = ws;
    ws.connect();
    setConnected(true);

    const rt = createRealtimeClient({
      apiKey: REALTIME_API_KEY,
      onTranscript: (text, confidence, isFinal, reading) => {
        const payload: ClientMessage = {
          type: isFinal ? "asr_final" : "asr_partial",
          payload: {
            asr: { text, confidence, final: isFinal },
            paralinguistic: reading,
          },
        };
        ws.send(payload);
        if (isFinal) setStatus("processing");
      },
      onUserBargeIn: () => {
        ws.send({ type: "user_bargein", payload: { reason: "interrupt" } });
      },
      onSpeaking: () => setStatus("speaking"),
      onListening: () => setStatus("listening"),
    });
    rtRef.current = rt;

    return () => {
      rt.dispose();
      ws.close();
    };
  }, []);

  const onStart = () => {
    wsRef.current?.send({ type: "hello", payload: { clientVersion: "web-0.1" } });
    setStatus("listening");
  };

  const onStop = () => {
    rtRef.current?.stopMic();
    setStatus("idle");
  };

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>
      <h1>실시간 음성 설문 (Prototype)</h1>
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <button onClick={onStart} disabled={!connected}>세션 시작</button>
        <button onClick={onStop}>마이크 종료</button>
        <span>상태: {status}</span>
        {sessionId && <span>세션: {sessionId}</span>}
      </div>
      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: "#fff", padding: 12, borderRadius: 8, minHeight: 320 }}>
          <h3>대화 로그</h3>
          <div style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
            {log.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        </div>
        <div style={{ background: "#fff", padding: 12, borderRadius: 8, minHeight: 320 }}>
          <h3>요약</h3>
          <pre style={{ fontSize: 12 }}>
            {summary ? JSON.stringify(summary, null, 2) : "(수신 대기)"}
          </pre>
        </div>
      </section>
    </main>
  );
}
