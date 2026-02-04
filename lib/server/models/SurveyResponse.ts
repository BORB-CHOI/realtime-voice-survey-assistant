import mongoose, { Schema } from "mongoose";

export type AnswerValue = {
  value: unknown;
  originalText?: string;
  reasoning?: string;
  confidence?: number;
  evidence?: string[];
  hypotheses?: Array<{
    value: unknown;
    confidence: number;
    evidence: string[];
  }>;
};

export type SurveyResponseDocument = mongoose.Document & {
  sessionId: mongoose.Types.ObjectId;
  answers: Map<string, AnswerValue>;
  createdAt: Date;
  updatedAt: Date;
};

const AnswerValueSchema = new Schema(
  {
    value: { type: Schema.Types.Mixed },
    originalText: { type: String },
    reasoning: { type: String },
    confidence: { type: Number },
    evidence: { type: [String], default: [] },
    hypotheses: { type: [Schema.Types.Mixed], default: [] },
  },
  { _id: false },
);

const SurveyResponseSchema = new Schema(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "SurveySession",
      required: true,
    },
    answers: { type: Map, of: AnswerValueSchema, default: {} },
  },
  { timestamps: true },
);

export const SurveyResponse =
  (mongoose.models.SurveyResponse as any) ||
  mongoose.model("SurveyResponse", SurveyResponseSchema);
