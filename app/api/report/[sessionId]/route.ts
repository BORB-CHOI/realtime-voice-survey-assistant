/**
 * GET /api/report/[sessionId]
 * 세션 데이터를 기반으로 AI 정책보고서 JSON 반환
 */
import { NextRequest, NextResponse } from "next/server";
import { connectMongo } from "@/lib/server/db";
import { SurveySession } from "@/lib/server/models/SurveySession";
import { SurveyResponse } from "@/lib/server/models/SurveyResponse";
import { SurveyDefinition } from "@/lib/server/models/SurveyDefinition";
import { generateReportContent, getCachedReport } from "@/lib/server/reportGenerator";

export async function GET(
  _req: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  try {
    // 캐시 히트 → DB/AI 호출 없이 즉시 반환
    const cached = getCachedReport(params.sessionId);
    if (cached) {
      return NextResponse.json(cached);
    }

    await connectMongo();

    const session = await SurveySession.findById(params.sessionId).lean() as any;
    if (!session) {
      return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
    }

    const responseDoc = await SurveyResponse.findOne({
      sessionId: session._id,
    }).lean() as any;

    const definition = session.definitionId
      ? await SurveyDefinition.findById(session.definitionId).lean() as any
      : null;

    const report = await generateReportContent({
      sessionId: String(session._id),
      respondentId: session.respondentId || "anonymous",
      transcript: session.transcript || [],
      answers: responseDoc?.answers || {},
      surveyName: definition?.name,
    });

    return NextResponse.json(report);
  } catch (err: any) {
    console.error("[report] error:", err);
    return NextResponse.json(
      { error: err?.message || "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
