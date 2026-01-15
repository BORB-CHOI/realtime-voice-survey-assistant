from __future__ import annotations

from collections import Counter
from datetime import datetime
from typing import Any, Dict

from state_machine import SessionState


class Summarizer:
	def build_summary(self, session: SessionState) -> Dict[str, Any]:
		explicit_answers = {item.question_id: item.answer for item in session.log}

		keywords = Counter()
		hesitation_topics = []
		fillers = []
		for item in session.log:
			for tok in item.answer.split():
				if len(tok) > 1:
					keywords[tok] += 1
			if item.paralinguistic.get("hesitation") or item.paralinguistic.get("silence_ms_before", 0) > 3000:
				hesitation_topics.append(item.question_id)
			if item.paralinguistic.get("filler"):
				fillers.extend(item.paralinguistic.get("filler") or [])

		implicit = {
			"반복_키워드": [k for k, v in keywords.most_common() if v >= 2],
			"감정_태그": [],
			"회피_주제": [q.question_id for q in session.log if q.answer in ("없다", "모르겠다", "기억 안 나")],
			"침묵_주제": hesitation_topics,
			"필러": fillers,
		}

		temporal = {
			"과거": {},
			"현재": {},
			"전환점": [],
		}

		social = {
			"주요_의존_대상": [],
			"지원_네트워크": {},
		}

		duration_ms = 0
		if session.log:
			duration_ms = int((session.log[-1].timestamp - session.started_at).total_seconds() * 1000)
		else:
			duration_ms = int((datetime.utcnow() - session.started_at).total_seconds() * 1000)

		trust_score = 0.8
		trust_score -= 0.05 * len([a for a in explicit_answers.values() if a in ("없다", "모르겠다", "기억 안 나")])
		trust_score -= 0.05 * len(hesitation_topics)
		trust_score = max(0.1, min(0.95, trust_score))

		meta = {
			"총_소요_시간": duration_ms,
			"중단_사유": session.end_reason or ("complete" if session.is_complete else "interrupted"),
			"응답_신뢰도_추정": trust_score,
		}

		return {
			"명시적_답변": explicit_answers,
			"암묵적_패턴": implicit,
			"시간_변화": temporal,
			"사회적_맥락": social,
			"설문_메타": meta,
		}
