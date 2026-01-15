from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional


TERMINATION_KEYWORDS = ["끝", "그만", "됐어", "이거 언제 끝나"]
AVOIDANCE_TOKENS = ["없다", "모르겠다", "기억 안 나", "글쎄"]


class Stage(str, Enum):
	intro = "intro"
	rapport = "rapport"
	screening = "screening"
	core = "core"
	deepening = "deepening"
	wrapup = "wrapup"
	end = "end"


QUESTION_FLOW = [
	{"id": "Q1", "stage": Stage.intro, "utterance": "할머니, 지난 일주일에 바깥 일 보러 몇 번이나 나오셨어요? 경로당이나 시장 포함해서요."},
	{"id": "Q2", "stage": Stage.core, "utterance": "나오시면 주로 어디 가세요? 병원이에요, 시장이에요?"},
	{"id": "Q3", "stage": Stage.core, "utterance": "집 문 나서서 도착까지 시간은 얼마나 걸리세요? 걷고 기다리는 시간 다 합쳐서요."},
	{"id": "Q4", "stage": Stage.core, "utterance": "걸어서 다녀올 만한 거리인가요, 아니면 차 없으면 어려운가요?"},
	{"id": "Q5", "stage": Stage.core, "utterance": "정류장까지 걸어가다 다리 아파서 돌아간 적 있으세요?"},
	{"id": "Q6", "stage": Stage.deepening, "utterance": "정류장에 의자 있나요? 버스 기다릴 때 계속 서 계셔야 했나요?"},
	{"id": "Q7", "stage": Stage.deepening, "utterance": "버스가 안 와서 포기하고 집에 간 적 있으세요?"},
	{"id": "Q9", "stage": Stage.deepening, "utterance": "차만 편했으면 가고 싶었는데 참은 곳 있으세요?"},
	{"id": "Q10", "stage": Stage.deepening, "utterance": "병원 예약했는데 차 못 잡아서 늦거나 못 간 적 있으세요?"},
	{"id": "Q12", "stage": Stage.wrapup, "utterance": "한 달에 교통비로 얼마 정도 쓰시는 것 같으세요? 버스비랑 택시비 합쳐서요."},
	{"id": "Q13", "stage": Stage.wrapup, "utterance": "자녀분들 바쁠까 봐 태워달라는 말 참은 적 있으세요?"},
	{"id": "Q15", "stage": Stage.wrapup, "utterance": "집 앞에서 바로 태워주는 차가 생기면 못 가셨던 곳 매일 나가실 마음 있으세요?"},
	{"id": "Q16", "stage": Stage.wrapup, "utterance": "한 번 탈 때 얼마면 기분 좋게 내실까요? 버스비 정도? 택시비 반값?"},
]


@dataclass
class LogItem:
	question_id: str
	question: str
	answer: str
	paralinguistic: Dict[str, Any]
	timestamp: datetime


@dataclass
class SessionState:
	session_id: str
	stage: Stage = Stage.intro
	question_index: int = 0
	fatigue_counter: int = 0
	avoidance_counter: int = 0
	end_reason: Optional[str] = None
	started_at: datetime = field(default_factory=datetime.utcnow)
	last_seen: datetime = field(default_factory=datetime.utcnow)
	last_question: Optional[str] = None
	log: List[LogItem] = field(default_factory=list)

	@property
	def is_complete(self) -> bool:
		return self.stage == Stage.end

	def touch(self) -> None:
		self.last_seen = datetime.utcnow()

	@staticmethod
	def new(session_id: str) -> "SessionState":
		return SessionState(session_id=session_id)


class SurveyStateMachine:
	@staticmethod
	def next_question(session: SessionState) -> Optional[Dict[str, Any]]:
		if session.question_index >= len(QUESTION_FLOW):
			session.stage = Stage.end
			return None
		q = QUESTION_FLOW[session.question_index]
		session.last_question = q["utterance"]
		session.stage = q["stage"]
		return {"utterance": q["utterance"], "state": q["stage"], "hint": q["id"]}

	@staticmethod
	def handle_user_turn(session: SessionState, asr: Any, paralinguistic: Any, is_final: bool) -> List[Dict[str, Any]]:
		actions: List[Dict[str, Any]] = []
		session.touch()

		# 시간 초과(20분) 피로 종료
		if datetime.utcnow() - session.started_at > timedelta(minutes=20):
			session.stage = Stage.end
			session.end_reason = "fatigue"
			actions.append({"type": "end", "payload": {"reason": "fatigue"}})
			return actions

		# 즉시 종료 키워드
		if is_final and any(k in asr.text for k in TERMINATION_KEYWORDS):
			session.stage = Stage.end
			session.end_reason = "keyword"
			actions.append({"type": "end", "payload": {"reason": "keyword"}})
			return actions

		# 장시간 침묵 시 질문 단순화 유도 (partial에서도 동작)
		if getattr(paralinguistic, "silence_ms_before", 0) > 5000 and not is_final:
			actions.append(SurveyStateMachine._clarify_from_silence(session))
			session.fatigue_counter += 1
			return actions

		# 회피/머뭇거림 카운트
		if is_final and SurveyStateMachine._is_avoidance(asr.text):
			session.avoidance_counter += 1
		else:
			session.avoidance_counter = max(session.avoidance_counter - 1, 0)

		# 피로도 누적: 긴 침묵, 높은 fatigue_score, 매우 짧은 발화
		if getattr(paralinguistic, "silence_ms_before", 0) > 5000:
			session.fatigue_counter += 1
		if getattr(paralinguistic, "fatigue_score", 0) and paralinguistic.fatigue_score > 0.6:
			session.fatigue_counter += 1
		if getattr(paralinguistic, "utterance_ms", 0) < 800:
			session.fatigue_counter += 1

		# 종료 조건: 회피/피로
		if session.avoidance_counter >= 3:
			session.stage = Stage.end
			session.end_reason = "avoidance"
			actions.append({"type": "end", "payload": {"reason": "avoidance"}})
			return actions

		if session.fatigue_counter >= 4:
			session.stage = Stage.end
			session.end_reason = "fatigue"
			actions.append({"type": "end", "payload": {"reason": "fatigue"}})
			return actions

		if is_final:
			SurveyStateMachine._append_log(session, asr.text, paralinguistic)
			session.question_index += 1

		if session.question_index >= len(QUESTION_FLOW):
			session.stage = Stage.end
			session.end_reason = "complete"
			actions.append({"type": "end", "payload": {"reason": "complete"}})
			return actions

		next_q = SurveyStateMachine.next_question(session)
		if next_q:
			actions.append({"type": "ask", "payload": next_q})
		return actions

	@staticmethod
	def handle_barge_in(session: SessionState) -> Optional[Dict[str, Any]]:
		hint = "제가 천천히 다시 여쭤볼게요."
		if session.last_question:
			utter = session.last_question + " 혹시 이 부분이 어려우시면 편하게 말씀 주세요."
		else:
			utter = "말씀해 주시면 이어서 질문드릴게요."
		return {"type": "clarify", "payload": {"utterance": utter, "state": session.stage, "hint": hint}}

	@staticmethod
	def _clarify_from_silence(session: SessionState) -> Dict[str, Any]:
		base = session.last_question or "제가 다시 여쭤볼게요."
		utter = f"{base} 혹시 질문이 길었나요? 편하게 한두 마디로 말씀 주세요."
		return {"type": "clarify", "payload": {"utterance": utter, "state": session.stage, "hint": "silence"}}

	@staticmethod
	def _append_log(session: SessionState, answer: str, paralinguistic: Any) -> None:
		if session.question_index >= len(QUESTION_FLOW):
			return
		q = QUESTION_FLOW[session.question_index]
		session.log.append(
			LogItem(
				question_id=q["id"],
				question=q["utterance"],
				answer=answer,
				paralinguistic=paralinguistic.model_dump() if hasattr(paralinguistic, "model_dump") else {},
				timestamp=datetime.utcnow(),
			)
		)

	@staticmethod
	def _is_avoidance(text: str) -> bool:
		return any(tok in text for tok in AVOIDANCE_TOKENS)
