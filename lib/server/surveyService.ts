import OpenAI from "openai";
import { connectMongo } from "./db";
import { SurveyDefinition } from "./models/SurveyDefinition";
import { SurveySession, TranscriptItem } from "./models/SurveySession";
import { SurveyResponse } from "./models/SurveyResponse";
import { generateSystemPrompt } from "./promptBuilder";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

type SubmitSurveyInput = {
  definitionId: string;
  transcript: TranscriptItem[];
  respondentId?: string;
};

const callExtraction = async (prompt: string, transcript: TranscriptItem[]) => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing");
  }
  const content = JSON.stringify({ transcript });
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: prompt },
      { role: "user", content },
    ],
    temperature: 0.1,
  });
  const message = response.choices[0]?.message?.content || "";
  try {
    return JSON.parse(message);
  } catch {
    return { answers: {}, _raw: message };
  }
};

const normalizeAnswers = (
  definition: { questions: { id: string }[] },
  extraction: any,
) => {
  const extractedAnswers =
    extraction?.answers && typeof extraction.answers === "object"
      ? extraction.answers
      : {};

  const normalized: Record<
    string,
    {
      value: any;
      originalText: string | null;
      reasoning: string;
      confidence?: number;
      evidence?: string[];
      hypotheses?: Array<{
        value: any;
        confidence: number;
        evidence: string[];
      }>;
    }
  > = {};

  for (const q of definition.questions || []) {
    const raw = extractedAnswers?.[q.id];
    const value =
      raw && Object.prototype.hasOwnProperty.call(raw, "value")
        ? raw.value
        : null;
    const originalText =
      raw && typeof raw.originalText === "string" ? raw.originalText : null;
    const reasoning =
      raw && typeof raw.reasoning === "string" ? raw.reasoning : "NO_EVIDENCE";

    const confidence =
      raw && typeof raw.confidence === "number" ? raw.confidence : undefined;
    const evidence =
      raw && Array.isArray(raw.evidence)
        ? raw.evidence.filter((x: any) => typeof x === "string")
        : undefined;
    const hypotheses =
      raw && Array.isArray(raw.hypotheses)
        ? raw.hypotheses
            .map((h: any) => ({
              value: h?.value,
              confidence: typeof h?.confidence === "number" ? h.confidence : 0,
              evidence: Array.isArray(h?.evidence)
                ? h.evidence.filter((x: any) => typeof x === "string")
                : [],
            }))
            .filter((h: any) => h.evidence.length > 0)
        : undefined;

    normalized[q.id] = {
      value: value ?? null,
      originalText,
      reasoning,
      ...(confidence === undefined ? {} : { confidence }),
      ...(evidence ? { evidence } : {}),
      ...(hypotheses ? { hypotheses } : {}),
    };
  }

  return normalized;
};

export const submitSurveyResult = async (input: SubmitSurveyInput) => {
  await connectMongo();

  const session = await SurveySession.create({
    definitionId: input.definitionId,
    respondentId: input.respondentId || "anonymous",
    transcript: input.transcript,
  });

  const definition = await SurveyDefinition.findById(input.definitionId);
  if (!definition) {
    throw new Error("SURVEY_DEFINITION_NOT_FOUND");
  }

  const prompt = generateSystemPrompt(definition);
  const extraction = await callExtraction(prompt, input.transcript);
  const answers = normalizeAnswers(definition, extraction);

  const response = await SurveyResponse.create({
    sessionId: session._id,
    answers,
  });

  return { session, response };
};
