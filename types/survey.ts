export const surveyQuestionTypes = [
  "SINGLE_SELECT",
  "MULTI_SELECT",
  "SCALE",
  "TEXT_SUMMARY",
  "NUMBER",
  "CURRENCY",
  "CUSTOM",
] as const;

export type SurveyQuestionType = (typeof surveyQuestionTypes)[number];

export type SurveyQuestionDefinition = {
  id: string;
  text: string;
  type: SurveyQuestionType;
  options?: string[];
  customInstruction?: string;
  extractionGuide?: string;
};
