import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/server/db";
import { SurveyDefinition } from "@/lib/server/models/SurveyDefinition";
import { surveyQuestionTypes } from "@/types/survey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  await connectMongo();
  const definitions = await SurveyDefinition.find().sort({ createdAt: -1 });
  return NextResponse.json({ definitions });
}

export async function POST(req: Request) {
  await connectMongo();
  let payload: any = null;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const questions = Array.isArray(payload?.questions) ? payload.questions : [];
  if (!questions.length) {
    return NextResponse.json(
      { error: "QUESTIONS_REQUIRED" },
      { status: 400 },
    );
  }

  const allowedTypes = surveyQuestionTypes as readonly string[];
  const invalidType = questions.find(
    (q: { type?: string }) => q?.type && !allowedTypes.includes(q.type),
  );
  if (invalidType) {
    return NextResponse.json(
      { error: "INVALID_QUESTION_TYPE", detail: invalidType?.type },
      { status: 400 },
    );
  }

  const definition = await SurveyDefinition.create({
    name: payload?.name,
    questions,
  });

  return NextResponse.json({ definition }, { status: 201 });
}
