"use client";

import { useEffect, useRef, useState } from "react";
import { createRealtimeClient } from "../lib/realtimeClient";

export default function VoiceSurveyClient() {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "listening" | "processing" | "speaking"
  >("idle");
  const [log, setLog] = useState<string[]>([]);
  const [micPermission, setMicPermission] = useState<
    "unknown" | "granted" | "denied"
  >("unknown");
  const [hearing, setHearing] = useState(false);
  const [lastHeard, setLastHeard] = useState("");
  const [volume, setVolume] = useState(0); // 0.0 ~ 1.0 RMS
  const [assistantTyping, setAssistantTyping] = useState("");
  const [userTyping, setUserTyping] = useState("");
  const hearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meterStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const realtimeErrorLogged = useRef(false);
  const lastVolumeUpdateRef = useRef(0);
  const tokenRef = useRef<string | null>(null);

  const rtRef = useRef<ReturnType<typeof createRealtimeClient> | null>(null);

  const appendLog = (line: string) =>
    setLog((prev) => [...prev.slice(-100), line]);

  useEffect(() => {
    let cancelled = false;
    const initRealtime = async () => {
      // 세션 시작 전에 에페메럴 토큰을 미리 받아둔다.
      try {
        const res = await fetch("/api/realtime-token");
        if (res.ok) {
          const data = await res.json();
          tokenRef.current = data?.value || data?.client_secret?.value || null;
        } else {
          const detail = await res.text();
          appendLog(`token fetch failed: ${res.status} ${detail}`);
          tokenRef.current = null;
        }
      } catch (err) {
        appendLog(
          `token fetch error: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
        tokenRef.current = null;
      }

      if (cancelled) return;
      if (!tokenRef.current) {
        appendLog("token missing: /api/realtime-token 응답을 확인하세요.");
        return;
      }

      const rt = createRealtimeClient({
        apiKey: tokenRef.current,
        onTranscript: (text, confidence, isFinal, reading) => {
          if (isFinal) setStatus("processing");

          setLastHeard(text);
          setUserTyping(isFinal ? "" : text);
          setHearing(true);
          if (hearTimerRef.current) clearTimeout(hearTimerRef.current);
          hearTimerRef.current = setTimeout(
            () => setHearing(false),
            isFinal ? 1600 : 900
          );

          if (isFinal) {
            appendLog(`me: ${text}`);
          }
        },
        onAssistantText: (text, isFinal) => {
          if (!text) return;
          setStatus("speaking");
          setAssistantTyping(text);
          if (isFinal) {
            setAssistantTyping("");
            appendLog(`ai: ${text}`);
            setStatus("listening");
          }
        },
        onUserBargeIn: () => {},
        onSpeaking: () => setStatus("speaking"),
        onListening: () => setStatus("listening"),
      });
      rtRef.current = rt;

      rt.connect()
        .then(() => {
          appendLog("realtime connected");
          setConnected(true);
        })
        .catch((err) => {
          if (!realtimeErrorLogged.current) {
            appendLog(`realtime connect error: ${err?.message || err}`);
            realtimeErrorLogged.current = true;
          }
        });
    };

    initRealtime();

    return () => {
      cancelled = true;
      if (hearTimerRef.current) clearTimeout(hearTimerRef.current);
      stopMeter();
      rtRef.current?.dispose();
    };
  }, []);

  const stopMeter = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    analyserRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    if (meterStreamRef.current) {
      meterStreamRef.current.getTracks().forEach((t) => t.stop());
      meterStreamRef.current = null;
    }
    setVolume(0);
  };

  const startMeter = (stream: MediaStream) => {
    if (audioCtxRef.current) return; // already running
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.minDecibels = -80;
    analyser.maxDecibels = -10;
    analyser.smoothingTimeConstant = 0.4;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    const data = new Float32Array(analyser.fftSize);

    ctx.resume().catch(() => undefined);

    const loop = () => {
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = data[i];
        sum += v * v; // RMS
      }
      const rms = Math.sqrt(sum / data.length);
      const now = performance.now();
      if (now - lastVolumeUpdateRef.current > 50) {
        setVolume(Math.min(1, rms * 4));
        lastVolumeUpdateRef.current = now;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    loop();

    audioCtxRef.current = ctx;
    analyserRef.current = analyser;
  };

  const requestMic = async () => {
    try {
      if (meterStreamRef.current) return meterStreamRef.current;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      meterStreamRef.current = stream;
      setMicPermission("granted");
      startMeter(stream);
      return stream;
    } catch (err) {
      console.error("mic permission denied", err);
      setMicPermission("denied");
      throw err;
    }
  };

  const onStart = async () => {
    try {
      if (micPermission !== "granted") {
        await requestMic();
      }
    } catch {
      appendLog("마이크 권한이 필요합니다.");
      return;
    }

    if (typeof rtRef.current?.startMic === "function") {
      rtRef.current.startMic();
    } else {
      appendLog("realtime startMic 준비 중 (새로고침 후 다시 시도)");
    }
    rtRef.current?.requestResponse(
      "지금부터 설문을 시작해 첫 질문을 해주세요."
    );
    setStatus("listening");
  };

  const onStop = () => {
    rtRef.current?.stopMic();
    setHearing(false);
    stopMeter();
    setStatus("idle");
  };

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>
      <h1>실시간 음성 설문 (Prototype)</h1>
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <button onClick={onStart} disabled={!connected}>
          세션 시작
        </button>
        <button onClick={onStop}>마이크 종료</button>
        <span>상태: {status}</span>
        <span>
          마이크:{" "}
          {micPermission === "granted"
            ? "허용됨"
            : micPermission === "denied"
            ? "거부됨"
            : "대기"}
        </span>
        {hearing && (
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 999,
              background: "#d1fae5",
              color: "#065f46",
            }}
          >
            음성 인식 중
          </span>
        )}
      </div>
      <div
        style={{
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 8,
          minHeight: 20,
        }}
      >
        <span style={{ fontSize: 13, color: "#334155" }}>입력 레벨</span>
        <div
          style={{
            flex: 1,
            height: 10,
            background: "#e2e8f0",
            borderRadius: 999,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              width: `${Math.min(100, Math.max(0, volume * 100))}%`,
              background: "linear-gradient(90deg, #22c55e, #f59e0b)",
              transition: "width 120ms ease-out",
            }}
          />
        </div>
        <span style={{ minWidth: 40, fontSize: 12, color: "#475569" }}>
          {(volume * 100).toFixed(0)}%
        </span>
      </div>
      {lastHeard && (
        <div
          style={{
            marginBottom: 12,
            padding: 8,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
          }}
        >
          <strong>최근 인식:</strong> {lastHeard}
        </div>
      )}
      <section
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
      >
        <div
          style={{
            background: "#fff",
            padding: 12,
            borderRadius: 8,
            minHeight: 320,
          }}
        >
          <h3>대화 로그</h3>
          <div style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
            {log.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
            {userTyping && <div style={{ opacity: 0.7 }}>me: {userTyping}</div>}
            {assistantTyping && (
              <div style={{ opacity: 0.8 }}>ai: {assistantTyping}</div>
            )}
          </div>
        </div>
        <div
          style={{
            background: "#fff",
            padding: 12,
            borderRadius: 8,
            minHeight: 320,
          }}
        >
          <h3>상태</h3>
          <pre style={{ fontSize: 12 }}>
            {connected ? "connected" : "disconnected"}
          </pre>
        </div>
      </section>
    </main>
  );
}
