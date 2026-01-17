import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const docPath = path.resolve(__dirname, "..", "..", "docs", "elderly-mobility-system.md");
const outPath = path.resolve(__dirname, "..", "lib", "systemPrompt.ts");

const doc = fs.readFileSync(docPath, "utf8");
const content = `// AUTO-GENERATED. DO NOT EDIT BY HAND.\n` +
  `// Source: docs/elderly-mobility-system.md\n\n` +
  `export const SYSTEM_PROMPT = ${JSON.stringify(doc)};\n`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, content, "utf8");

console.log("system prompt generated:", outPath);
