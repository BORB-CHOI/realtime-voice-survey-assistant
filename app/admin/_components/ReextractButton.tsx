"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ReextractButtonProps = {
  sessionId: string;
  disabled?: boolean;
};

export default function ReextractButton({
  sessionId,
  disabled = false,
}: ReextractButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (disabled || isLoading) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/survey-submissions/reextract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const message = data?.error || "REQUEST_FAILED";
        throw new Error(message);
      }

      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "REQUEST_FAILED";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isLoading}
        style={{
          padding: "6px 10px",
          borderRadius: 10,
          border: "1px solid #cbd5f5",
          background: disabled ? "#e2e8f0" : "#eef2ff",
          color: "#3730a3",
          fontSize: 12,
          fontWeight: 600,
          cursor: disabled || isLoading ? "not-allowed" : "pointer",
        }}
      >
        {isLoading ? "추출 중..." : "AI 추출 재요청"}
      </button>
      {error && (
        <span style={{ fontSize: 11, color: "#b91c1c" }}>{error}</span>
      )}
    </div>
  );
}
