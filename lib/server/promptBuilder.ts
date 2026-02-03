import { SurveyDefinitionDocument } from "./models/SurveyDefinition";

const typeTemplates: Record<string, (q: { options?: string[]; extractionGuide?: string }) => string> = {
  SINGLE_SELECT: (q) =>
    `사용자의 답변을 다음 옵션 중 하나로 매핑하시오: ${
      q.options?.join(", ") || ""
    }`,
  MULTI_SELECT: (q) =>
    `사용자의 답변에서 해당되는 옵션을 모두 선택하시오: ${
      q.options?.join(", ") || ""
    }`,
  NUMBER: () => "숫자만 추출하여 정수형으로 반환하시오.",
  TEXT_SUMMARY: () => "사용자의 답변을 1문장으로 요약하시오.",
  CUSTOM: (q) => q.extractionGuide || "추가 지침이 없습니다.",
};

export const generateSystemPrompt = (definition: SurveyDefinitionDocument) => {
  const lines = definition.questions.map((q) => {
    const builder = typeTemplates[q.type] || (() => "사용자 답변을 요약하시오.");
    const rule = builder(q);
    const guide = q.extractionGuide && q.type !== "CUSTOM" ? ` 추가 지침: ${q.extractionGuide}` : "";
    return `- 질문 ID: ${q.id}\n  질문: ${q.text}\n  규칙: ${rule}${guide}`;
  });

  return [
    "너는 설문 응답 추출기다.",
    "다음 질문 규칙에 따라 대화를 분석하라.",
    "응답은 반드시 JSON 객체로만 반환하라.",
    "형식: { \"answers\": { \"questionId\": { \"value\": <값>, \"originalText\": <문장>, \"reasoning\": <근거> } } }",
    "규칙 목록:",
    ...lines,
  ].join("\n");
};
