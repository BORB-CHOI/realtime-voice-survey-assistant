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
    messages: [
      { role: "system", content: prompt },
      { role: "user", content },
    ],
    temperature: 0.1,
  });
  const message = response.choices[0]?.message?.content || "";
  return JSON.parse(message);
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
  const answers = extraction?.answers || {};

  const response = await SurveyResponse.create({
    sessionId: session._id,
    answers,
  });

  return { session, response };
};
