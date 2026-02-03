import mongoose, { Schema } from "mongoose";

export type SurveyQuestion = {
  id: string;
  text: string;
  type: string;
  options?: string[];
  extractionGuide?: string;
};

export type SurveyDefinitionDocument = mongoose.Document & {
  name?: string;
  questions: SurveyQuestion[];
  createdAt: Date;
  updatedAt: Date;
};

const SurveyQuestionSchema = new Schema<SurveyQuestion>(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    type: { type: String, required: true },
    options: { type: [String], default: [] },
    extractionGuide: { type: String },
  },
  { _id: false },
);

const SurveyDefinitionSchema = new Schema<SurveyDefinitionDocument>(
  {
    name: { type: String },
    questions: { type: [SurveyQuestionSchema], default: [] },
  },
  { timestamps: true },
);

export const SurveyDefinition =
  (mongoose.models.SurveyDefinition as mongoose.Model<SurveyDefinitionDocument>) ||
  mongoose.model<SurveyDefinitionDocument>(
    "SurveyDefinition",
    SurveyDefinitionSchema,
  );
