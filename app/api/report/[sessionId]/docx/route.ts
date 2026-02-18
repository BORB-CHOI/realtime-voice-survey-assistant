/**
 * GET /api/report/[sessionId]/docx
 * 세션 보고서를 .docx 파일로 생성하여 다운로드
 */
import { NextRequest, NextResponse } from "next/server";
import { connectMongo } from "@/lib/server/db";
import { SurveySession } from "@/lib/server/models/SurveySession";
import { SurveyResponse } from "@/lib/server/models/SurveyResponse";
import { SurveyDefinition } from "@/lib/server/models/SurveyDefinition";
import {
  generateReportContent,
  generateDocx,
  getCachedReport,
} from "@/lib/server/reportGenerator";

export async function GET(
  _req: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  try {
    // 캐시된 보고서가 있으면 재사용 (꼬임 방지: sessionId로 정확히 매칭)
    let report = getCachedReport(params.sessionId);

    if (!report) {
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

      report = await generateReportContent({
        sessionId: String(session._id),
        respondentId: session.respondentId || "anonymous",
        transcript: session.transcript || [],
        answers: responseDoc?.answers || {},
        surveyName: definition?.name,
      });
    }

    const buffer = await generateDocx(report);

    // sessionId + 날짜시간으로 완전 고유한 파일명 생성
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = encodeURIComponent(
      `정책보고서_${report.respondentId}_${params.sessionId.slice(-6)}_${ts}.docx`,
    );

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      },
    });
  } catch (err: any) {
    console.error("[report/docx] error:", err);
    return NextResponse.json(
      { error: err?.message || "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
