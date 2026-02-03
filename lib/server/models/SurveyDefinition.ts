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

const SurveyQuestionSchema: Schema = new Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    type: { type: String, required: true },
    options: { type: [String], default: [] },
    extractionGuide: { type: String },
  } as any,
  { _id: false },
);

const SurveyDefinitionSchema: Schema = new Schema(
  {
    name: { type: String },
    questions: { type: [SurveyQuestionSchema], default: [] },
  } as any,
  { timestamps: true },
);

export const SurveyDefinition = ((mongoose as any).models.SurveyDefinition ||
  (mongoose as any).model(
    "SurveyDefinition",
    SurveyDefinitionSchema,
  )) as unknown as mongoose.Model<SurveyDefinitionDocument>;
