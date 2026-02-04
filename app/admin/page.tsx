import { connectMongo } from "@/lib/server/db";
import { SurveySession } from "@/lib/server/models/SurveySession";
import { SurveyResponse } from "@/lib/server/models/SurveyResponse";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await connectMongo();
  const sessions = await SurveySession.find().sort({ createdAt: -1 }).lean();
  const responses = await SurveyResponse.find().lean();
  const responseMap = new Map(
    responses.map((item: any) => [String(item.sessionId), item]),
  );

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>설문 결과</h1>
          <p style={{ color: "#475569", marginTop: 6, fontSize: 13 }}>
            세션 종료 후 저장된 대화 원본과 AI 추출 결과를 보여줍니다.
          </p>
        </div>
        <a
          href="/"
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #e2e8f0",
            background: "#f8fafc",
            color: "#0f172a",
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          설문 화면으로
        </a>
      </header>

      <section
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
        }}
      >
        {[
          { label: "총 세션", value: sessions.length },
          { label: "응답 수", value: responses.length },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              padding: 12,
              borderRadius: 12,
              border: "1px solid #e2e8f0",
              background: "#ffffff",
            }}
          >
            <div style={{ fontSize: 12, color: "#64748b" }}>{stat.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>
              {stat.value}
            </div>
          </div>
        ))}
      </section>

      <div style={{ marginTop: 20, display: "grid", gap: 14 }}>
        {sessions.map((session: any) => {
          const response = responseMap.get(String(session._id)) as
            | { answers?: Record<string, any> }
            | undefined;
          const createdAt = session.createdAt
            ? new Date(session.createdAt).toLocaleString("ko-KR")
            : "";
          return (
            <div
              key={String(session._id)}
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 14,
                padding: 16,
                background: "#ffffff",
                boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    session: {String(session._id)}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    respondent: {session.respondentId}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  {createdAt && (
                    <span
                      style={{
                        fontSize: 12,
                        padding: "4px 8px",
                        borderRadius: 999,
                        background: "#f1f5f9",
                        color: "#334155",
                      }}
                    >
                      {createdAt}
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: 12,
                      padding: "4px 8px",
                      borderRadius: 999,
                      background: response ? "#dcfce7" : "#fee2e2",
                      color: response ? "#166534" : "#991b1b",
                    }}
                  >
                    {response ? "추출 완료" : "추출 없음"}
                  </span>
                </div>
              </div>

              <div
                style={{
                  marginTop: 12,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 10,
                    padding: 12,
                    background: "#f8fafc",
                  }}
                >
                  <div style={{ fontSize: 12, color: "#475569" }}>
                    Transcript
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      whiteSpace: "pre-wrap",
                      marginTop: 8,
                      maxHeight: 240,
                      overflow: "auto",
                    }}
                  >
                    {session.transcript.length
                      ? session.transcript
                          .map((item: any) => `${item.role}: ${item.text}`)
                          .join("\n")
                      : "(no transcript)"}
                  </div>
                </div>
                <div
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 10,
                    padding: 12,
                    background: "#f8fafc",
                  }}
                >
                  <div style={{ fontSize: 12, color: "#475569" }}>
                    Extraction
                  </div>
                  {response?.answers && Object.keys(response.answers).length ? (
                    <div
                      style={{
                        marginTop: 8,
                        display: "grid",
                        gap: 8,
                        maxHeight: 260,
                        overflow: "auto",
                      }}
                    >
                      {Object.entries(response.answers).map(
                        ([key, value]: [string, any]) => {
                          const v = value?.value;
                          const originalText = value?.originalText;
                          const reasoning = value?.reasoning;
                          const confidence =
                            typeof value?.confidence === "number"
                              ? value.confidence
                              : null;
                          return (
                            <div
                              key={key}
                              style={{
                                border: "1px solid #e2e8f0",
                                borderRadius: 8,
                                padding: 8,
                                background: "#ffffff",
                                display: "grid",
                                gap: 6,
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: 8,
                                  flexWrap: "wrap",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: "#0f172a",
                                  }}
                                >
                                  {key}
                                </span>
                                {confidence !== null && (
                                  <span
                                    style={{
                                      fontSize: 11,
                                      padding: "2px 8px",
                                      borderRadius: 999,
                                      background: "#e0f2fe",
                                      color: "#0c4a6e",
                                    }}
                                  >
                                    신뢰도 {Math.round(confidence * 100)}%
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: 12, color: "#334155" }}>
                                <strong>값</strong>: {String(v ?? "-")}
                              </div>
                              {originalText && (
                                <div style={{ fontSize: 12, color: "#475569" }}>
                                  <strong>원문</strong>: {originalText}
                                </div>
                              )}
                              {reasoning && (
                                <div style={{ fontSize: 12, color: "#64748b" }}>
                                  <strong>근거</strong>: {reasoning}
                                </div>
                              )}
                            </div>
                          );
                        },
                      )}
                    </div>
                  ) : (
                    <div
                      style={{ fontSize: 12, marginTop: 8, color: "#94a3b8" }}
                    >
                      (no response)
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
