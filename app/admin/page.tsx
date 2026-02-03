import { connectMongo } from "@/lib/server/db";
import { SurveySession } from "@/lib/server/models/SurveySession";
import { SurveyResponse } from "@/lib/server/models/SurveyResponse";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await connectMongo();
  const sessions = await SurveySession.find().sort({ createdAt: -1 }).lean();
  const responses = await SurveyResponse.find().lean();
  const responseMap = new Map(
    responses.map((item) => [String(item.sessionId), item]),
  );

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>
      <h1>설문 결과</h1>
      <p style={{ color: "#475569", marginTop: 4 }}>
        세션 종료 후 저장된 대화 원본과 AI 추출 결과를 보여줍니다.
      </p>
      <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
        {sessions.map((session) => {
          const response = responseMap.get(String(session._id));
          return (
            <div
              key={String(session._id)}
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 10,
                padding: 12,
                background: "#fff",
              }}
            >
              <div style={{ fontSize: 12, color: "#64748b" }}>
                session: {String(session._id)}
              </div>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                respondent: {session.respondentId}
              </div>
              <div style={{ marginTop: 8 }}>
                <strong>Transcript</strong>
                <div style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
                  {session.transcript
                    .map((item: any) => `${item.role}: ${item.text}`)
                    .join("\n")}
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
                <strong>Extraction</strong>
                <pre style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
                  {response
                    ? JSON.stringify(response.answers ?? {}, null, 2)
                    : "(no response)"}
                </pre>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
