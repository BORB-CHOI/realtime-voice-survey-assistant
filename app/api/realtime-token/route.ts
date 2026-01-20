import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const resolveSystemPromptPath = () => {
  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, "docs", "elderly-mobility-system.md"),
    path.resolve(cwd, "..", "docs", "elderly-mobility-system.md"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
};

const readSystemPrompt = () => {
  const docPath = resolveSystemPromptPath();
  return fs.readFileSync(docPath, "utf8");
};

export async function GET() {
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

  const model =
    process.env.OPENAI_REALTIME_MODEL ||
    process.env.NEXT_PUBLIC_REALTIME_MODEL ||
    "gpt-4o-realtime-preview";
  const sessionConfig = {
    session: {
      type: "realtime",
      model,
      instructions: readSystemPrompt(),
      output_modalities: ["audio"],
      audio: { output: { voice: "marin" } },
    },
  };

  const response = await fetch(
    "https://api.openai.com/v1/realtime/client_secrets",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sessionConfig),
    },
  );

  const data = await response.json();
  if (!response.ok) {
    return NextResponse.json(data, {
      status: response.status,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }

  // Normalize possible response shapes.
  if (!data?.value && data?.client_secret?.value) {
    data.value = data.client_secret.value;
  }

  if (!data?.value) {
    return NextResponse.json(
      { error: "TOKEN_MISSING", detail: data },
      { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
