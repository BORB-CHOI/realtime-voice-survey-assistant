import mongoose, { Schema } from "mongoose";

export type TranscriptItem = {
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
};

export type SurveySessionDocument = mongoose.Document & {
  definitionId: mongoose.Types.ObjectId;
  respondentId: string;
  transcript: TranscriptItem[];
  createdAt: Date;
  updatedAt: Date;
};

const TranscriptItemSchema = new Schema(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, required: true },
  },
  { _id: false },
);

const SurveySessionSchema = new Schema(
  {
    definitionId: {
      type: Schema.Types.ObjectId,
      ref: "SurveyDefinition",
      required: true,
    },
    respondentId: { type: String, required: true },
    transcript: { type: [TranscriptItemSchema], default: [] },
  },
  { timestamps: true },
);

export const SurveySession =
  (mongoose.models.SurveySession as any) ||
  mongoose.model("SurveySession", SurveySessionSchema);
