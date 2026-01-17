import { NextResponse } from "next/server";
import { SYSTEM_PROMPT } from "../../../lib/systemPrompt";

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY missing" },
      { status: 500 }
    );
  }

  const model =
    process.env.OPENAI_REALTIME_MODEL ||
    process.env.NEXT_PUBLIC_REALTIME_MODEL ||
    "gpt-realtime";
  const sessionConfig = {
    session: {
      type: "realtime",
      model,
      instructions: SYSTEM_PROMPT,
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
    }
  );

  const data = await response.json();
  if (!response.ok) {
    return NextResponse.json(data, { status: response.status });
  }

  if (!data?.value) {
    return NextResponse.json(
      { error: "TOKEN_MISSING", detail: data },
      { status: 502 }
    );
  }

  return NextResponse.json(data);
}
