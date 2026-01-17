from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ValidationError
from dotenv import load_dotenv

from state_machine import SessionState, SurveyStateMachine
from summarizer import Summarizer

ROOT_DIR = Path(__file__).resolve().parents[1]
load_dotenv(ROOT_DIR / ".env")

app = FastAPI(title="Elderly Mobility Realtime Survey")

sessions: Dict[str, SessionState] = {}
summarizer = Summarizer()
SESSION_TTL_SECONDS = 1800  # 30 minutes idle


class ASRPayload(BaseModel):
    text: str
    confidence: float
    final: bool


class ParalinguisticPayload(BaseModel):
    silence_ms_before: int
    utterance_ms: int
    hesitation: bool
    filler: Optional[List[str]] = None
    fatigue_score: Optional[float] = None


class HelloPayload(BaseModel):
    clientVersion: Optional[str] = None


class UserBargeInPayload(BaseModel):
    reason: str


class FrontendEventPayload(BaseModel):
    state: str


class Envelope(BaseModel):
    type: str
    payload: Dict[str, Any] = {}
    sessionId: Optional[str] = None


async def send_message(ws: WebSocket, type_: str, payload: Dict[str, Any], session_id: Optional[str]) -> None:
    await ws.send_json({"type": type_, "payload": payload, "sessionId": session_id})


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    session_id: Optional[str] = None
    try:
        while True:
            raw = await websocket.receive_text()
            # Clean up idle sessions
            _evict_stale_sessions()
            try:
                env = Envelope.model_validate_json(raw)
            except ValidationError as exc:
                await send_message(websocket, "error", {"code": "INVALID_ENVELOPE", "message": str(exc)}, session_id)
                continue

            if env.type == "hello":
                session_id = str(uuid.uuid4())
                sessions[session_id] = SessionState.new(session_id)
                await send_message(websocket, "session_created", {"sessionId": session_id}, session_id)
                first_prompt = SurveyStateMachine.next_question(sessions[session_id])
                if first_prompt:
                    await send_message(websocket, "ask", first_prompt, session_id)
                continue

            if not env.sessionId or env.sessionId not in sessions:
                await send_message(websocket, "error", {"code": "NO_SESSION", "message": "Unknown session"}, session_id)
                continue

            session_id = env.sessionId
            session = sessions[session_id]
            session.touch()

            if env.type in {"asr_partial", "asr_final"}:
                try:
                    asr = ASRPayload.model_validate(env.payload.get("asr", {}))
                    para = ParalinguisticPayload.model_validate(env.payload.get("paralinguistic", {}))
                except ValidationError as exc:
                    await send_message(websocket, "error", {"code": "INVALID_ASR", "message": str(exc)}, session_id)
                    continue

                actions = SurveyStateMachine.handle_user_turn(
                    session=session,
                    asr=asr,
                    paralinguistic=para,
                    is_final=asr.final,
                )
                for action in actions:
                    await send_message(websocket, action["type"], action.get("payload", {}), session_id)

                if session.is_complete:
                    summary = summarizer.build_summary(session)
                    await send_message(websocket, "summary", {"summary": summary}, session_id)
                    await websocket.close()
                    sessions.pop(session_id, None)
                    break
                continue

            if env.type == "user_bargein":
                try:
                    payload = UserBargeInPayload.model_validate(env.payload)
                except ValidationError as exc:
                    await send_message(websocket, "error", {"code": "INVALID_BARGEIN", "message": str(exc)}, session_id)
                    continue
                action = SurveyStateMachine.handle_barge_in(session)
                if action:
                    await send_message(websocket, action["type"], action.get("payload", {}), session_id)
                continue

            if env.type == "frontend_event":
                try:
                    FrontendEventPayload.model_validate(env.payload)
                except ValidationError:
                    pass
                await send_message(websocket, "ack", {"received": env.type}, session_id)
                continue

            await send_message(websocket, "error", {"code": "UNSUPPORTED", "message": f"type {env.type}"}, session_id)
    except WebSocketDisconnect:
        if session_id:
            sessions.pop(session_id, None)


@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({"status": "ok", "sessions": len(sessions)})


def _evict_stale_sessions() -> None:
    now = datetime.utcnow()
    stale = [sid for sid, s in sessions.items() if (now - s.last_seen).total_seconds() > SESSION_TTL_SECONDS]
    for sid in stale:
        sessions.pop(sid, None)
