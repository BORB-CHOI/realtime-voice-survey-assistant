import { NextResponse } from "next/server";
import { readSystemPrompt } from "../../../lib/server/systemPrompt";

export async function GET() {
  const instructions = readSystemPrompt();
  return NextResponse.json({ instructions });
}
