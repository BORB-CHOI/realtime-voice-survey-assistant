# Python WS Server Design

역할: 세션 UUID 발급, 설문 상태 머신 실행, ASR/비언어 신호 처리, 질문 생성, 종료 판단, 최종 요약 생성.

## 흐름
1) 클라이언트 `hello` → 서버 `session_created {sessionId}`
2) asr_partial/final + paralinguistic 수신 → 상태 머신 업데이트 → 필요 시 `ask` 또는 `clarify`
3) 종료 조건 충족 시 `end` → 이어서 `summary` 전송

## 세션 상태 보관
- `sessionId` → {state, fatigue_counter, avoidance_counter, timeline, last_question, accum_log}
- 메모리 dict (프로토타입), 만료 TTL

## 주요 핸들러
- on_hello(): UUID 생성/저장
- on_asr_partial(): 맥락 누적, 아직 질문 전이는 보류
- on_asr_final(): 의도/키워드/회피/모순 감지 → 상태 전이 → `ask` or `clarify`
- on_user_bargein(): 질문 재구성/단순화 후 재전송

## 안전장치
- malformed payload → `error` 응답, 세션 유지
- 세션 미존재 → `error` + close

## 의존 모듈
- `state_machine.py`: 상태 전이/질문 선택
- `summarizer.py`: 최종 JSON 생성
