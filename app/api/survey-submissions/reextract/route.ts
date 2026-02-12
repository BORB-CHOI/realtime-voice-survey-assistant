import { NextResponse } from "next/server";
import { reextractSurveyResult } from "@/lib/server/surveyService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  let payload: any = null;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId : "";
  if (!sessionId) {
    return NextResponse.json({ error: "SESSION_ID_REQUIRED" }, { status: 400 });
  }

  try {
    const { session, response } = await reextractSurveyResult({ sessionId });
    return NextResponse.json({ session, response }, { status: 200 });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const status =
      message === "SESSION_NOT_FOUND"
        ? 404
        : message === "TRANSCRIPT_REQUIRED"
          ? 400
          : message === "SURVEY_DEFINITION_NOT_FOUND"
            ? 400
            : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
