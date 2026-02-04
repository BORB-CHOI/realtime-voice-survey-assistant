import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/server/db";
import { SurveyDefinition } from "@/lib/server/models/SurveyDefinition";
import { SurveySession } from "@/lib/server/models/SurveySession";
import { SurveyResponse } from "@/lib/server/models/SurveyResponse";
import { submitSurveyResult } from "@/lib/server/surveyService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  await connectMongo();

  let payload: any = null;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const transcript = Array.isArray(payload?.transcript)
    ? payload.transcript
    : [];
  if (!transcript.length) {
    return NextResponse.json(
      { error: "TRANSCRIPT_REQUIRED" },
      { status: 400 },
    );
  }

  let definitionId = payload?.definitionId as string | undefined;
  if (!definitionId) {
    const latest = await SurveyDefinition.findOne().sort({ createdAt: -1 });
    if (!latest) {
      return NextResponse.json(
        { error: "SURVEY_DEFINITION_MISSING" },
        { status: 400 },
      );
    }
    definitionId = String(latest._id);
  }

  const { session, response } = await submitSurveyResult({
    definitionId,
    transcript,
    respondentId: payload?.respondentId,
  });

  return NextResponse.json({ session, response }, { status: 201 });
}

export async function GET() {
  await connectMongo();
  const sessions = await SurveySession.find()
    .sort({ createdAt: -1 })
    .lean();
  const responses = await SurveyResponse.find().lean();

  const responseMap = new Map(
    responses.map((item) => [String(item.sessionId), item]),
  );

  const data = sessions.map((session: any) => ({
    session,
    response: responseMap.get(String(session._id)) || null,
  }));

  return NextResponse.json({ data });
}
