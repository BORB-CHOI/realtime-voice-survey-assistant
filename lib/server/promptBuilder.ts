import { SurveyDefinitionDocument } from "./models/SurveyDefinition";

const typeTemplates: Record<
  string,
  (q: { options?: string[]; extractionGuide?: string }) => string
> = {
  SINGLE_SELECT: (q) =>
    [
      `옵션: ${q.options?.join(", ") || ""}`,
      "사용자 발화에 근거해 위 옵션 중 1개로만 매핑하시오.",
      "근거가 부족하거나 해당 질문에 대한 답변이 없으면 value=null.",
      "사용자가 '기타'를 명시하거나 옵션에 없는 대상을 직접 언급한 경우에만 '기타'를 선택하시오.",
    ].join(" "),
  MULTI_SELECT: (q) =>
    [
      `옵션: ${q.options?.join(", ") || ""}`,
      "사용자 발화에 근거해 해당되는 옵션을 모두 선택하시오.",
      "근거가 부족하거나 해당 질문에 대한 답변이 없으면 value=null.",
    ].join(" "),
  NUMBER: () =>
    [
      "사용자가 숫자를 명시적으로 말한 경우에만 정수로 추출하시오.",
      "숫자 근거가 없으면 value=null.",
    ].join(" "),
  SCALE: () =>
    [
      "사용자가 1~5점 등 척도를 명시적으로 말한 경우에만 정수로 추출하시오.",
      "척도 근거가 없으면 value=null.",
    ].join(" "),
  CURRENCY: () =>
    [
      "사용자가 금액을 명시적으로 말한 경우에만 원 단위 정수로 추출하시오.",
      "금액 근거가 없으면 value=null.",
    ].join(" "),
  TEXT_SUMMARY: () =>
    [
      "해당 질문에 대한 사용자 답변이 명시적으로 존재할 때만 3문장 이내로 요약하시오.",
      "질문과 무관한 발화(예: 목적지만 말함)를 억지로 불편/원인으로 바꾸지 말고 value=null로 두시오.",
    ].join(" "),
  CUSTOM: (q) => q.extractionGuide || "추가 지침이 없습니다.",
};

export const generateSystemPrompt = (definition: SurveyDefinitionDocument) => {
  const lines = definition.questions.map((q) => {
    const builder =
      typeTemplates[q.type] || (() => "사용자 답변을 요약하시오.");
    const rule = builder(q);
    const guide =
      q.extractionGuide && q.type !== "CUSTOM"
        ? ` 추가 지침: ${q.extractionGuide}`
        : "";
    return `- 질문 ID: ${q.id}\n  질문: ${q.text}\n  규칙: ${rule}${guide}`;
  });

  return [
    "너는 설문 응답 추출기다.",
    "다음 질문 규칙에 따라 대화를 분석하라.",
    "중요: 대화에 근거가 없는 내용을 만들어내지 마라.",
    "질문에 대한 답이 대화에서 명시적으로 확인되지 않으면 해당 질문의 value는 반드시 null로 둬라.",
    "사용자가 단지 '영화 많이 봤어'라고 말했을 때, 그것은 '목적지/활동' 정보일 수 있으나 '불편/원인' 답변으로 변환하는 등 관련성이 낮은 데이터로 변환하면 안 된다.",
    "reasoning에는 반드시 대화에서 확인된 근거를 짧게 적고, 근거가 없으면 'NO_EVIDENCE'라고 적어라.",
    "비언어적/행동 신호(회피, 주제 전환, 조기 종료 등)는 결론이 아니라 가설로서 hypotheses에만 기록할 수 있다.",
    "hypotheses는 다음 규칙을 따른다:",
    "- 각 항목은 { value, confidence(0~1), evidence(string[]) }",
    "- evidence는 대화에서 인용 가능한 문장/패턴 1~3개",
    "- evidence가 없으면 hypotheses에 넣지 마라",
    "응답은 반드시 JSON 객체로만 반환하라.",
    '형식: { "answers": { "questionId": { "value": <값|null>, "originalText": <문장|null>, "reasoning": <근거|NO_EVIDENCE>, "confidence": <0~1>, "evidence": <string[]>, "hypotheses": <{value:any, confidence:number, evidence:string[]}[]> } } }',
    "answers에는 설문 정의의 모든 질문 ID를 포함하라(모르면 null).",
    "규칙 목록:",
    ...lines,
  ].join("\n");
};
