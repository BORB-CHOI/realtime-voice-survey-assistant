# Elderly Mobility Voice Survey

노인 이동 불편을 음성 대화로 정량화하는 프로토타입입니다. 브라우저는 OpenAI Realtime API(WebRTC)로 음성을 처리하고, Next.js API Route에서 에페메럴 토큰을 발급해 API 키를 숨깁니다.

## Architecture
- **Frontend (Next.js)**: 브라우저에서 Realtime JS SDK로 WebRTC 세션을 열어 ASR/TTS를 수행합니다.
- **Token API (Next.js Route)**: 서버 사이드에서 에페메럴 토큰을 발급해 브라우저가 Realtime에 접속합니다.
- **Data flow**: 브라우저 WebRTC ↔ OpenAI Realtime API.

## Run Locally
- `npm install`
- 루트 .env에 값 설정
  - `OPENAI_API_KEY=<OpenAI key>`
  - `OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview`
- `npm run dev` (http://localhost:3000)

## System Prompt
- 에이전트 시스템 프롬프트 원본은 docs/elderly-mobility-system.md에 유지합니다. README에는 포함하지 않습니다.
