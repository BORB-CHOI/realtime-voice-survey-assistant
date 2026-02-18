"use client";

import { useState } from "react";

type ReportSection = { title: string; content: string };
type PolicyReport = {
  title: string;
  subtitle: string;
  date: string;
  respondentId: string;
  sessionId: string;
  executiveSummary: string;
  sections: ReportSection[];
  keyFindings: string[];
  recommendations: string[];
  rawAnswers: Record<string, any>;
};

export function ReportButton({ sessionId }: { sessionId: string }) {
  const [loading, setLoading] = useState<"idle" | "preview" | "docx">("idle");
  const [report, setReport] = useState<PolicyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const handlePreview = async () => {
    setLoading("preview");
    setError(null);
    try {
      const res = await fetch(`/api/report/${sessionId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PolicyReport = await res.json();
      setReport(data);
      setOpen(true);
    } catch (err: any) {
      setError(err?.message || "오류");
    } finally {
      setLoading("idle");
    }
  };

  const handleDocx = () => {
    setLoading("docx");
    const link = document.createElement("a");
    link.href = `/api/report/${sessionId}/docx`;
    link.download = "";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => setLoading("idle"), 2000);
  };

  return (
    <>
      {/* 버튼 그룹 */}
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={handlePreview}
          disabled={loading !== "idle"}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid #bfdbfe",
            background: loading === "preview" ? "#dbeafe" : "#eff6ff",
            color: "#1d4ed8",
            fontSize: 12,
            fontWeight: 600,
            cursor: loading !== "idle" ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {loading === "preview" ? (
            <>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  border: "2px solid #93c5fd",
                  borderTopColor: "#1d4ed8",
                  borderRadius: "50%",
                  animation: "spin 0.7s linear infinite",
                }}
              />
              생성중…
            </>
          ) : (
            "📄 보고서 미리보기"
          )}
        </button>

        <button
          onClick={handleDocx}
          disabled={loading !== "idle"}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid #bbf7d0",
            background: loading === "docx" ? "#dcfce7" : "#f0fdf4",
            color: "#15803d",
            fontSize: 12,
            fontWeight: 600,
            cursor: loading !== "idle" ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {loading === "docx" ? (
            <>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  border: "2px solid #86efac",
                  borderTopColor: "#15803d",
                  borderRadius: "50%",
                  animation: "spin 0.7s linear infinite",
                }}
              />
              변환중…
            </>
          ) : (
            "⬇️ DOCX 다운로드"
          )}
        </button>
      </div>

      {error && (
        <div
          style={{
            marginTop: 6,
            padding: "6px 10px",
            borderRadius: 8,
            background: "#fee2e2",
            color: "#991b1b",
            fontSize: 12,
          }}
        >
          오류: {error}
        </div>
      )}

      {/* 보고서 미리보기 모달 */}
      {open && report && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.55)",
            zIndex: 1000,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "32px 16px",
            overflowY: "auto",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#ffffff",
              borderRadius: 16,
              padding: "32px 28px",
              maxWidth: 780,
              width: "100%",
              boxShadow: "0 20px 60px rgba(15,23,42,0.2)",
              position: "relative",
            }}
          >
            {/* 닫기 */}
            <button
              onClick={() => setOpen(false)}
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                border: "none",
                background: "#f1f5f9",
                borderRadius: 8,
                padding: "4px 10px",
                fontSize: 14,
                cursor: "pointer",
                color: "#475569",
              }}
            >
              ✕
            </button>

            {/* 표지 */}
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div
                style={{
                  display: "inline-block",
                  background: "#eff6ff",
                  color: "#1d4ed8",
                  borderRadius: 999,
                  padding: "4px 14px",
                  fontSize: 11,
                  fontWeight: 700,
                  marginBottom: 10,
                }}
              >
                정책보고서
              </div>
              <h2
                style={{
                  margin: "0 0 6px",
                  fontSize: 22,
                  fontWeight: 800,
                  color: "#0f172a",
                }}
              >
                {report.title}
              </h2>
              <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>
                {report.subtitle} · {report.date}
              </p>
            </div>

            <hr style={{ border: "none", borderTop: "1px solid #e2e8f0", marginBottom: 20 }} />

            {/* 요약 */}
            {report.executiveSummary && (
              <section style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: "0 0 8px" }}>
                  요 약
                </h3>
                <p
                  style={{
                    fontSize: 13,
                    color: "#334155",
                    lineHeight: 1.75,
                    margin: 0,
                    padding: "12px 16px",
                    background: "#f8fafc",
                    borderRadius: 10,
                    borderLeft: "3px solid #3b82f6",
                  }}
                >
                  {report.executiveSummary}
                </p>
              </section>
            )}

            {/* 본문 섹션 */}
            {report.sections.map((sec, i) => (
              <section key={i} style={{ marginBottom: 18 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", margin: "0 0 6px" }}>
                  {i + 1}. {sec.title}
                </h3>
                <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.7, margin: 0 }}>
                  {sec.content}
                </p>
              </section>
            ))}

            {/* 핵심 발견 */}
            {report.keyFindings.length > 0 && (
              <section style={{ marginBottom: 18 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: "0 0 8px" }}>
                  핵심 발견사항
                </h3>
                <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
                  {report.keyFindings.map((f, i) => (
                    <li key={i} style={{ fontSize: 13, color: "#334155", lineHeight: 1.6 }}>
                      {f}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 정책 제언 */}
            {report.recommendations.length > 0 && (
              <section style={{ marginBottom: 18 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: "0 0 8px" }}>
                  정책 제언
                </h3>
                <div style={{ display: "grid", gap: 6 }}>
                  {report.recommendations.map((rec, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        gap: 10,
                        padding: "10px 14px",
                        borderRadius: 10,
                        background: "#f0fdf4",
                        border: "1px solid #bbf7d0",
                        alignItems: "flex-start",
                      }}
                    >
                      <span
                        style={{
                          minWidth: 22,
                          height: 22,
                          borderRadius: "50%",
                          background: "#15803d",
                          color: "#fff",
                          fontSize: 11,
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {i + 1}
                      </span>
                      <span style={{ fontSize: 13, color: "#14532d", lineHeight: 1.6 }}>
                        {rec}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 다운로드 버튼 */}
            <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => setOpen(false)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  background: "#f8fafc",
                  color: "#475569",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                닫기
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  handleDocx();
                }}
                disabled={loading !== "idle"}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "1px solid #bbf7d0",
                  background: "#f0fdf4",
                  color: "#15803d",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                ⬇️ DOCX 다운로드
              </button>
            </div>
          </div>

          {/* 스피너 애니메이션 */}
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </>
  );
}
