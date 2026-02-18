"""
ITS 정책보고서 PDF 구조 분석 스크립트

1. PyMuPDF로 PDF 페이지 → PNG 변환
2. GPT-4o Vision으로 각 페이지 레이아웃 분석
3. 분석 결과를 docs/report-style-guide.json 으로 저장
"""

import os
import sys
import json
import base64
import pathlib
import fitz  # PyMuPDF

# .venv 환경에서 openai 임포트
from openai import OpenAI

# ── 경로 설정 ─────────────────────────────────────────────
ROOT = pathlib.Path(__file__).parent.parent
PDF_PATH = ROOT / "docs" / "기본+RR-15-08_최종.pdf"
OUT_DIR = ROOT / "docs" / "pdf_pages"
STYLE_OUT = ROOT / "docs" / "report-style-guide.json"

OUT_DIR.mkdir(parents=True, exist_ok=True)

# ── API 키 로드 ────────────────────────────────────────────
dotenv_path = ROOT / ".env"
if dotenv_path.exists():
    for line in dotenv_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

api_key = os.environ.get("OPENAI_API_KEY", "")
if not api_key:
    print("ERROR: OPENAI_API_KEY not found in .env")
    sys.exit(1)

client = OpenAI(api_key=api_key)

# ── PDF → PNG 변환 ─────────────────────────────────────────
print(f"[1/3] PDF 변환 중: {PDF_PATH.name}")
doc = fitz.open(str(PDF_PATH))
total_pages = len(doc)
print(f"      총 {total_pages}페이지")

# 분석 대상 페이지: 표지(0), 목차(1), 본문 첫 페이지(2),
# 본문 중간(total//2), 뒷부분(total*3//4), 마지막(-1)
sample_indices = sorted(set([
    0, 1, 2,
    total_pages // 4,
    total_pages // 2,
    total_pages * 3 // 4,
    total_pages - 1,
]))
sample_indices = [i for i in sample_indices if 0 <= i < total_pages]

page_images = {}
for idx in sample_indices:
    page = doc[idx]
    mat = fitz.Matrix(2.0, 2.0)  # 2배 해상도
    pix = page.get_pixmap(matrix=mat)
    out_path = OUT_DIR / f"page_{idx+1:03d}.png"
    pix.save(str(out_path))
    page_images[idx + 1] = out_path
    print(f"      저장: {out_path.name}")

doc.close()

# ── GPT-4o Vision 분석 ────────────────────────────────────
print("\n[2/3] GPT-4o Vision 분석 중...")

SYSTEM_PROMPT = """당신은 문서 디자인 전문가입니다.
정책보고서 페이지 이미지를 분석하여 다음 항목을 JSON으로 추출하세요.

{
  "page_type": "표지|목차|본문|결론|부록 중 하나",
  "layout": {
    "margins": "여백 스타일 묘사 (좁음/보통/넓음, 비대칭 여부)",
    "columns": "단 수 (1단/2단 등)",
    "header_footer": "헤더/푸터 존재 여부 및 내용 묘사"
  },
  "typography": {
    "title_font": "제목 폰트 스타일 묘사 (굵기, 크기 추정, 색상)",
    "body_font": "본문 폰트 스타일 묘사",
    "heading_levels": "제목 계층 구조 묘사 (H1, H2, H3 스타일)"
  },
  "colors": {
    "primary": "주 색상 (hex 추정 또는 색상명)",
    "secondary": "보조 색상",
    "accent": "강조 색상",
    "background": "배경 색상"
  },
  "elements": {
    "has_table": true/false,
    "has_chart": true/false,
    "has_image": true/false,
    "has_sidebar": true/false,
    "has_divider": true/false,
    "special_elements": "특이한 디자인 요소 묘사"
  },
  "section_structure": "이 페이지의 섹션 구성 묘사",
  "design_notes": "전체적인 디자인 특징 묘사 (정부보고서 스타일, 학술지 스타일 등)"
}"""

page_analyses = {}
for page_num, img_path in page_images.items():
    print(f"      분석 중: {page_num}페이지...")
    img_bytes = img_path.read_bytes()
    b64 = base64.b64encode(img_bytes).decode()

    resp = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": f"이 이미지는 ITS 정책보고서의 {page_num}페이지입니다. 구조와 디자인을 분석해주세요.",
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{b64}",
                            "detail": "high",
                        },
                    },
                ],
            },
        ],
        response_format={"type": "json_object"},
        max_tokens=1500,
    )
    raw = resp.choices[0].message.content or "{}"
    try:
        page_analyses[str(page_num)] = json.loads(raw)
    except Exception:
        page_analyses[str(page_num)] = {"_raw": raw}
    print(f"      완료: {page_num}페이지")

# ── 종합 스타일 가이드 생성 ───────────────────────────────
print("\n[2.5/3] 종합 스타일 가이드 도출 중...")

summary_resp = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {
            "role": "system",
            "content": """당신은 문서 디자인 전문가입니다.
여러 페이지 분석 결과를 종합하여 보고서 전체의 일관된 스타일 가이드를 JSON으로 작성하세요.

{
  "report_title": "보고서 분류명",
  "overall_style": "전체 디자인 기조",
  "cover_page": { "structure": "표지 구성 묘사", "key_elements": [...] },
  "toc_page": { "structure": "목차 페이지 구성" },
  "body_page": {
    "layout": "본문 레이아웃",
    "section_numbering": "섹션 번호 체계 (예: 1. / 1.1 / 가. 나. 등)",
    "paragraph_style": "단락 스타일"
  },
  "colors": {
    "primary": "주 색상 hex",
    "secondary": "보조 색상 hex",
    "accent": "강조 hex",
    "header_bg": "헤더 배경색 hex",
    "table_header_bg": "표 헤더 배경색 hex"
  },
  "typography": {
    "title_size_pt": 숫자,
    "h1_size_pt": 숫자,
    "h2_size_pt": 숫자,
    "body_size_pt": 숫자,
    "font_family": "폰트명 또는 유사 폰트",
    "line_spacing": "행간 묘사"
  },
  "recurring_elements": ["반복 등장하는 디자인 요소 목록"],
  "docx_implementation_notes": "docx 라이브러리로 구현 시 주의사항"
}""",
        },
        {
            "role": "user",
            "content": f"다음은 ITS 정책보고서 각 페이지 분석 결과입니다:\n\n{json.dumps(page_analyses, ensure_ascii=False, indent=2)}",
        },
    ],
    response_format={"type": "json_object"},
    max_tokens=2000,
)

summary_raw = summary_resp.choices[0].message.content or "{}"
try:
    style_guide = json.loads(summary_raw)
except Exception:
    style_guide = {"_raw": summary_raw}

# ── 결과 저장 ──────────────────────────────────────────────
output = {
    "source_pdf": PDF_PATH.name,
    "analyzed_pages": list(page_analyses.keys()),
    "page_analyses": page_analyses,
    "style_guide": style_guide,
}

STYLE_OUT.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")

print(f"\n[3/3] 분석 완료!")
print(f"      결과 저장: {STYLE_OUT}")
print(f"\n=== 종합 스타일 가이드 ===")
print(json.dumps(style_guide, ensure_ascii=False, indent=2))
