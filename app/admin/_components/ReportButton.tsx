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

      {/* ITS 정책보고서 스타일 미리보기 모달 */}
      {open && report && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 1000,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "40px 16px",
            overflowY: "auto",
          }}
        >
          {/* A4 비율 보고서 컨테이너 */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#ffffff",
              width: "100%",
              maxWidth: 740,
              padding: "52px 64px",
              boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
              position: "relative",
              fontFamily: "'Noto Serif KR', '바탕', Georgia, serif",
              color: "#000000",
            }}
          >
            {/* 닫기 버튼 */}
            <button
              onClick={() => setOpen(false)}
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                border: "1px solid #cccccc",
                background: "#ffffff",
                padding: "3px 10px",
                fontSize: 13,
                cursor: "pointer",
                color: "#555555",
                fontFamily: "sans-serif",
              }}
            >
              ✕
            </button>

            {/* ── 표지 영역 ── */}
            <div style={{ textAlign: "center", padding: "32px 0 48px" }}>
              <div
                style={{
                  borderTop: "2px solid #000",
                  borderBottom: "2px solid #000",
                  padding: "20px 0",
                  marginBottom: 32,
                }}
              >
                <h1
                  style={{
                    margin: 0,
                    fontSize: 24,
                    fontWeight: 700,
                    color: "#000000",
                    letterSpacing: "-0.5px",
                    lineHeight: 1.4,
                    fontFamily: "'Noto Sans KR', '맑은 고딕', sans-serif",
                  }}
                >
                  {report.title}
                </h1>
              </div>
              <p style={{ margin: "0 0 6px", fontSize: 14, color: "#595959", fontFamily: "sans-serif" }}>
                {report.subtitle}
              </p>
              <p style={{ margin: 0, fontSize: 13, color: "#808080", fontFamily: "sans-serif" }}>
                {report.date} · 스마트 모빌리티 정책연구소
              </p>
            </div>

            {/* ── 요약 ── */}
            {report.executiveSummary && (
              <section style={{ marginBottom: 32 }}>
                <div style={{ borderBottom: "1.5px solid #000", marginBottom: 10 }}>
                  <h2 style={{
                    margin: "0 0 6px",
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#000",
                    fontFamily: "'Noto Sans KR', '맑은 고딕', sans-serif",
                  }}>
                    제Ⅰ. 요&nbsp;&nbsp;&nbsp;약
                  </h2>
                </div>
                <p style={{
                  margin: 0,
                  fontSize: 13,
                  color: "#000000",
                  lineHeight: 2,
                  textIndent: "1em",
                }}>
                  {report.executiveSummary}
                </p>
              </section>
            )}

            {/* ── 본문 섹션 ── */}
            {report.sections.map((sec, i) => {
              const romanNums = ["Ⅱ","Ⅲ","Ⅳ","Ⅴ","Ⅵ","Ⅶ","Ⅷ"];
              return (
                <section key={i} style={{ marginBottom: 28 }}>
                  <div style={{ borderBottom: "1.5px solid #000", marginBottom: 10 }}>
                    <h2 style={{
                      margin: "0 0 6px",
                      fontSize: 15,
                      fontWeight: 700,
                      color: "#000",
                      fontFamily: "'Noto Sans KR', '맑은 고딕', sans-serif",
                    }}>
                      제{romanNums[i] ?? (i + 2) + "."}. {sec.title}
                    </h2>
                  </div>
                  <p style={{
                    margin: 0,
                    fontSize: 13,
                    color: "#000000",
                    lineHeight: 2,
                    textIndent: "1em",
                  }}>
                    {sec.content}
                  </p>
                </section>
              );
            })}

            {/* ── 핵심 발견사항 ── */}
            {report.keyFindings.length > 0 && (
              <section style={{ marginBottom: 28 }}>
                <div style={{ borderBottom: "1.5px solid #000", marginBottom: 10 }}>
                  <h2 style={{
                    margin: "0 0 6px",
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#000",
                    fontFamily: "'Noto Sans KR', '맑은 고딕', sans-serif",
                  }}>
                    핵심 발견사항
                  </h2>
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {report.keyFindings.map((f, i) => (
                    <li key={i} style={{
                      display: "flex",
                      gap: 8,
                      fontSize: 13,
                      color: "#000",
                      lineHeight: 1.9,
                      paddingLeft: "1em",
                    }}>
                      <span style={{ flexShrink: 0 }}>○</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* ── 정책 제언 ── */}
            {report.recommendations.length > 0 && (
              <section style={{ marginBottom: 28 }}>
                <div style={{ borderBottom: "1.5px solid #000", marginBottom: 10 }}>
                  <h2 style={{
                    margin: "0 0 6px",
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#000",
                    fontFamily: "'Noto Sans KR', '맑은 고딕', sans-serif",
                  }}>
                    정책 제언
                  </h2>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f2f2f2" }}>
                      <th style={{ border: "1px solid #aaaaaa", padding: "6px 10px", fontWeight: 700, width: 80, fontFamily: "sans-serif", textAlign: "center" }}>구분</th>
                      <th style={{ border: "1px solid #aaaaaa", padding: "6px 10px", fontWeight: 700, fontFamily: "sans-serif", textAlign: "center" }}>정책 제언 내용</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.recommendations.map((rec, i) => (
                      <tr key={i}>
                        <td style={{ border: "1px solid #aaaaaa", padding: "6px 10px", textAlign: "center", fontFamily: "sans-serif", color: "#000" }}>제언 {i + 1}</td>
                        <td style={{ border: "1px solid #aaaaaa", padding: "6px 12px", lineHeight: 1.8, color: "#000" }}>{rec}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* ── 하단 페이지 번호 스타일 ── */}
            <div style={{
              borderTop: "1px solid #aaaaaa",
              marginTop: 32,
              paddingTop: 10,
              textAlign: "center",
              fontSize: 12,
              color: "#808080",
              fontFamily: "sans-serif",
            }}>
              1
            </div>

            {/* ── 하단 버튼 ── */}
            <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end", gap: 8, fontFamily: "sans-serif" }}>
              <button
                onClick={() => setOpen(false)}
                style={{
                  padding: "7px 16px",
                  border: "1px solid #cccccc",
                  background: "#ffffff",
                  color: "#555555",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                닫기
              </button>
              <button
                onClick={() => { setOpen(false); handleDocx(); }}
                disabled={loading !== "idle"}
                style={{
                  padding: "7px 16px",
                  border: "1px solid #000000",
                  background: "#000000",
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                ⬇️ DOCX 다운로드
              </button>
            </div>
          </div>

          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </>
  );
}
