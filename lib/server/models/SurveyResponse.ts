import mongoose, { Schema } from "mongoose";

export type AnswerValue = {
  value: unknown;
  originalText?: string;
  reasoning?: string;
};

export type SurveyResponseDocument = mongoose.Document & {
  sessionId: mongoose.Types.ObjectId;
  answers: Map<string, AnswerValue>;
  createdAt: Date;
  updatedAt: Date;
};

const AnswerValueSchema = new Schema<AnswerValue>(
  {
    value: { type: Schema.Types.Mixed },
    originalText: { type: String },
    reasoning: { type: String },
  },
  { _id: false },
);

const SurveyResponseSchema = new Schema<SurveyResponseDocument>(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: "SurveySession", required: true },
    answers: { type: Map, of: AnswerValueSchema, default: {} },
  },
  { timestamps: true },
);

export const SurveyResponse =
  (mongoose.models.SurveyResponse as mongoose.Model<SurveyResponseDocument>) ||
  mongoose.model<SurveyResponseDocument>("SurveyResponse", SurveyResponseSchema);
