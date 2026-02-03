import { NextResponse } from "next/server";
import { readSystemPrompt } from "../../../../lib/server/systemPrompt";
import {
  fetchRealtimeToken,
  getAllowedRealtimeModels,
  resolveRequestedModel,
} from "../../../../lib/server/realtimeToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _req: Request,
  { params }: { params: { model: string } },
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY missing" },
      {
        status: 500,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  }

  const requested = decodeURIComponent(params.model || "");
  const model = resolveRequestedModel(requested);
  if (!model) {
    return NextResponse.json(
      {
        error: "UNSUPPORTED_MODEL",
        allowed: Array.from(getAllowedRealtimeModels()),
      },
      { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  const instructions = readSystemPrompt();
  const result = await fetchRealtimeToken({ apiKey, model, instructions });
  if (!result.ok) {
    return NextResponse.json(result.data, {
      status: result.status,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }

  if (!result.data?.value) {
    return NextResponse.json(
      { error: "TOKEN_MISSING", detail: result.data },
      { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  return NextResponse.json(result.data, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
