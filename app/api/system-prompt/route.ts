import { NextResponse } from "next/server";
import { readSystemPrompt } from "../../../lib/server/systemPrompt";
import { connectMongo } from "@/lib/server/db";
import { SurveyDefinition } from "@/lib/server/models/SurveyDefinition";
import { buildInterviewAddon } from "@/lib/server/interviewPrompt";

export async function GET() {
  const base = readSystemPrompt();

  try {
    await connectMongo();
    const latest = await SurveyDefinition.findOne().sort({ createdAt: -1 });
    if (!latest) {
      return NextResponse.json({ instructions: base, definitionId: null });
    }
    const addon = buildInterviewAddon(latest);
    return NextResponse.json({
      instructions: `${base}\n\n${addon}`,
      definitionId: String(latest._id),
    });
  } catch {
    return NextResponse.json({ instructions: base, definitionId: null });
  }
}
