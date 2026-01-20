import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

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

export async function GET() {
  const docPath = resolveSystemPromptPath();
  const instructions = fs.readFileSync(docPath, "utf8");
  return NextResponse.json({ instructions });
}
