import fs from "fs";
import path from "path";

export const resolveSystemPromptPath = () => {
  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, "prompts", "elderly-mobility-system.md"),
    path.resolve(cwd, "docs", "elderly-mobility-system.md"),
    path.resolve(cwd, "..", "prompts", "elderly-mobility-system.md"),
    path.resolve(cwd, "..", "docs", "elderly-mobility-system.md"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
};

export const readSystemPrompt = () => {
  const docPath = resolveSystemPromptPath();
  return fs.readFileSync(docPath, "utf8");
};
