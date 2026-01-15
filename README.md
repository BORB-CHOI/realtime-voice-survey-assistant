# Elderly Mobility Voice Survey

노인 이동 불편을 음성 대화로 정량화하는 프로토타입입니다. 브라우저는 OpenAI Realtime API(WebRTC)로 음성을 처리하고, Python FastAPI WebSocket 서버가 설문 상태와 종료 로직을 제어합니다.

## 프로젝트 개요 (원문 유지)
- 목적: 노인 이동 비효율을 실시간 음성 대화로 정량화. 음성은 브라우저↔OpenAI Realtime API(WebRTC), 설문 로직·요약은 Python WS 컨트롤 채널.
- 프런트: Next.js, Realtime JS SDK(브라우저 WebRTC), WS로 asr/paralinguistic 이벤트 송신, ask/clarify/end/summary 수신.
- 백엔드: FastAPI WebSocket, 세션 UUID 발급, 상태 머신·종료 판단, 구조화 JSON 생성. Realtime API 호출 없음.

## Architecture
- **Frontend (Next.js)**: 브라우저에서 Realtime JS SDK로 WebRTC 세션을 열어 ASR/TTS를 수행합니다. 컨트롤 채널은 WS로 Python 백엔드와 통신합니다.
- **Backend (FastAPI WebSocket)**: 세션 UUID 발급, 상태 머신 전이, 종료 판단, 구조화 요약 JSON 생성. OpenAI 호출은 하지 않습니다.
- **Data flow**: Realtime partial/final transcript → WS `asr_partial`/`asr_final` → 상태 머신 → `ask/clarify/end/summary` → 프런트가 TTS로 재생.

## Run Locally
1) **Backend**
- `python -m venv .venv && .\\.venv\\Scripts\\activate`
- `pip install -r requirements.txt`
- `uvicorn server.app:app --reload` (WS는 `ws://localhost:8000/ws`)

2) **Frontend**
- `cd web`
- `npm install`
- `.env.example`를 `.env.local`로 복사 후 값 설정
  - `NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws`
  - `NEXT_PUBLIC_REALTIME_API_KEY=<OpenAI key>` (프로덕션에서는 프록시/토큰 교환 권장)
  - `NEXT_PUBLIC_REALTIME_MODEL=gpt-4o-realtime-preview`
- `npm run dev` (http://localhost:3000)

## WebSocket 프로토콜 (요약 원문 + 상세)
- 단일 연결 `{type,payload,sessionId}`. sessionId는 서버 UUID 발급.
- client→server: `hello`, `asr_partial|asr_final`(asr{text,confidence,final}, paralinguistic{silence_ms_before, utterance_ms, hesitation, filler[], fatigue_score}), `user_bargein`, `frontend_event`.
- server→client: `session_created`, `ask`, `clarify`, `end`(keyword|fatigue|complete|avoidance), `summary`, `error`.
- 시퀀스: hello → session_created → asr_* ↔ ask/clarify → end + summary.

### WebSocket Protocol (action/payload envelope) — 전체 본문

단일 WS 연결, 모든 메시지는 `{ "type": string, "payload": object, "sessionId": string }` 형식. `sessionId`는 서버가 발급한 UUID. 음성 스트림은 브라우저↔OpenAI Realtime API(WebRTC)로 직접 교환하며, WS는 컨트롤/설문 상태만 다룬다.

#### Message Types (client → server)
- `hello`: 최초 연결 요청. payload: `{ "clientVersion": "web-0.1" }`
- `asr_partial`: Realtime partial transcript를 전달. payload: `{ "asr": { "text": string, "confidence": number, "final": false }, "paralinguistic": { "silence_ms_before": number, "utterance_ms": number, "hesitation": boolean, "filler": string[] | null, "fatigue_score": number | null } }`
- `asr_final`: 최종 ASR 세그먼트. payload 동일하나 `final: true`.
- `user_bargein`: 사용자가 말을 끊음 이벤트. payload: `{ "reason": "interrupt" | "clarify" }`
- `frontend_event`: UI 상태 보고. payload: `{ "state": "listening" | "processing" | "speaking" }`

#### Message Types (server → client)
- `session_created`: payload `{ "sessionId": uuid }`
- `ask`: 다음 질문 제시. payload `{ "utterance": string, "state": string, "hint": string | null }`
- `clarify`: 이해 확인/재진술. payload `{ "utterance": string }`
- `end`: 종료 지시. payload `{ "reason": "keyword" | "fatigue" | "complete" | "avoidance" }`
- `summary`: 최종 구조화 JSON. payload `{ "summary": SurveySummary }`

#### Payload Fields
- `asr`: `{ text, confidence (0-1), final (bool) }`
- `paralinguistic`: `{ silence_ms_before, utterance_ms, hesitation, filler (string[]|null), fatigue_score (0-1|nullable) }`

#### Error Handling
- 서버 파싱 오류 시 `error` 타입, payload `{ code: string, message: string }`, 세션 유지.

#### Realtime → WS 매핑 가이드 (프런트)
- Realtime partial/final transcript 이벤트 → `asr_partial`/`asr_final`로 전달.
- 사용자가 발화를 중간에 끊으면 `user_bargein` 전송 후 TTS 중단(프런트 책임).
- 상태 표시(listening/processing/speaking)는 필요 시 `frontend_event`로 보고(선택적), 서버는 ack만 응답.

#### Sequencing
- 클라이언트: `hello` → `session_created` → asr_* 반복 → 서버 ask/clarify → 종료 시 `end` + `summary`.

## 설문 상태/종료 로직 (요약 + 전체)
- 상태: intro → rapport → screening → core → deepening → wrapup → end.
- 회피 ≥3, 피로 타이머(20분), 종료 키워드 시 end. 긴 침묵/hesitation 시 질문 단순화·clarify.
- 종료 키워드: "끝", "그만", "됐어", "이거 언제 끝나".

### Survey State Machine — 전체 본문

상태: `intro` → `rapport` → `screening` → `core` (분기) → `deepening` → `wrapup` → `end`.

#### 전이 규칙
- `intro` 완료 후 `rapport` (가벼운 일상 질문, 신뢰 확보)
- `screening`: 피로도/청취 확인, 장비 안내. 회피 2회 이상 → 쉬운 질문으로 완화.
- `core`: 건강/일상지원/정서/디지털 활용 중 사용자 응답 키워드 기반으로 우선 주제 선택.
- `deepening`: 긍정 응답 → 이유/유지 요인/변화 시점, 부정 응답 → 어려움/지원 필요/전환점 탐색.
- `wrapup`: 요약 확인, 누락 주제 확인, 추가 하고 싶은 말 요청.

#### 분기 로직
- 긍정: “왜/어떻게 유지?” “예전엔 어땠나요?”
- 부정/없음: 관점 전환(과거/비교), 부분 성공 사례 유도, 부담 완충 멘트 포함.
- 회피/모르겠다 반복 ≥2: 난이도 낮추고 선택지 제공, 3회시 종료 제안.
- 모순 감지: "제가 잘못 이해했을 수 있는데, A와 B가 달라 보여요. 어떤 쪽이 더 맞을까요?"

#### 비언어 신호 활용
- `silence_ms` 길음: 질문 단순화 또는 재진술.
- `hesitation/filler` 많음: 속도 늦추고 예시 제공.
- `utterance_ms` 짧음 반복: 추가 예시/선택지 제시.

#### 피로도 관리
- 총 진행 15~20분 또는 연속 회피 3회 → 휴식/종료 제안.
- 처리 중 상태 길어지면 사과 및 진행 안내.

#### 종료 조건
- 키워드: "끝", "그만", "됐어", "이거 언제 끝나" 등.
- 회피 연속 3회, 피로도 타이머 초과, 명시적 종료 의사.

## Termination & Interruption Policies — 전체 본문

### 키워드 즉시 종료
- 리스트(기본): ["끝", "그만", "됐어", "이거 언제 끝나"]
- 검출: ASR final 세그먼트에 포함 시 즉시 `end(reason="keyword")`.

### 상태 기반 종료
- 연속 회피 ≥3 → `end(reason="avoidance")`
- 총 경과 ≥ 20분 → `end(reason="fatigue")`
- 사용자 명시적 종료 의사 → 즉시 종료

### 인터럽트 처리
- 클라이언트 `user_bargein` 수신 시 현재 TTS 중단(프론트 책임), 서버는 마지막 질문을 재구성하거나 단순화 후 `ask` 재전송.

### 피로도/속도 조절
- `silence_ms`가 길면 질문 길이 축소, 재진술.
- `hesitation/filler` 다수 → 속도 늦추고 선택지 제공.

### 로깅
- 종료 사유, 마지막 질문/응답, 누락된 주제, 응답 신뢰도 추정치를 summary에 포함.

## Frontend Realtime Flow — 전체 본문

원칙: 음성 스트림은 브라우저↔OpenAI Realtime API(WebRTC) 직결, 설문 로직은 Python WS(action/payload)로 제어.

### 초기화
- WS 연결 → `hello` 송신 → `session_created` 수신
- Realtime API 세션/토큰 준비 (토큰은 나중에 주입)

### 송수신
- 마이크 → Realtime → ASR partial/final 이벤트 수신 → WS로 asr_partial/asr_final 전송 (paralinguistic: silence_ms_before, utterance_ms, hesitation, filler[], fatigue_score)
- 서버 `ask/clarify` 수신 → TTS로 발화 → 상태 UI 업데이트(듣는/처리/말하는)
- 사용자 바지인 감지 시 `user_bargein` 전송, TTS 중단

### 상태 표시
- listening / processing / speaking 뱃지 및 wave/level meter
- 오류 시 토스트 + 재시도 버튼

### 종료
- 서버 `end` 수신 시 TTS 중단, 요약 `summary` 수신 후 화면 표시/다운로드

## Backend Implementation Map
- server/app.py: WebSocket 핸들러, 세션 관리(TTL 30분), hello→session_created, ASR 처리 후 상태 머신 호출, 종료 시 summary 전송.
- state_machine.py: 질문 세트(Q1–Q16), 단계 추적, 회피/피로 카운터, 침묵 시 clarify, 종료 사유(`keyword|fatigue|avoidance|complete`) 설정.
- summarizer.py: 명시적 답변 맵, 반복 키워드·필러·침묵/머뭇 주제 추출, 신뢰도(trust_score) 계산, 메타(총 소요 시간, 종료 사유) 포함한 JSON 생성.

## System Prompt
- 에이전트 시스템 프롬프트 원본은 docs/elderly-mobility-system.md에 유지합니다. README에는 포함하지 않습니다.
