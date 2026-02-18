/**
 * 정책보고서 생성 로직
 * - AI(GPT)를 사용해 설문 세션 데이터를 구조화된 정책보고서로 변환
 * - DOCX 파일 생성 지원
 */
import OpenAI from "openai";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  ImageRun,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
  convertInchesToTwip,
  UnderlineType,
} from "docx";

// ─────────────────────────────────────────────
// ITS 정책보고서 스타일 상수
// (docs/report-style-guide.json 분석 결과 기반)
// ─────────────────────────────────────────────
const ITS = {
  font: "바탕",           // 정부보고서 기본 폰트
  fontSans: "맑은 고딕",  // 제목/표 헤더용
  size: {
    title:    48,  // 24pt
    h1:       36,  // 18pt
    h2:       32,  // 16pt
    h3:       28,  // 14pt
    body:     24,  // 12pt
    small:    20,  // 10pt
    footer:   18,  // 9pt
  },
  color: {
    black:    "000000",
    gray:     "595959",
    lightGray:"808080",
    border:   "AAAAAA",
    tableHdr: "F2F2F2",
    white:    "FFFFFF",
  },
  // 여백 (twip 단위, 1인치 = 1440 twip)
  margin: {
    top:    convertInchesToTwip(1.0),
    bottom: convertInchesToTwip(1.0),
    left:   convertInchesToTwip(1.2),
    right:  convertInchesToTwip(1.0),
    header: convertInchesToTwip(0.5),
    footer: convertInchesToTwip(0.5),
  },
  lineSpacing: 360, // 1.5줄 간격
} as const;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

// ─────────────────────────────────────────────
// 서버 인메모리 캐시 (sessionId → PolicyReport)
// Next.js 모듈 레벨 변수 → 서버 프로세스 재시작 전까지 유지
// ─────────────────────────────────────────────
const reportCache = new Map<string, PolicyReport>();

export function getCachedReport(sessionId: string): PolicyReport | undefined {
  return reportCache.get(sessionId);
}

export function setCachedReport(sessionId: string, report: PolicyReport): void {
  reportCache.set(sessionId, report);
}

export function invalidateCachedReport(sessionId: string): void {
  reportCache.delete(sessionId);
  docxAssetCache.delete(sessionId);
}

// ─────────────────────────────────────────────
// DOCX 자산 캐시 (chart + aiImage Buffer)
// report JSON과 분리 — Buffer는 직렬화 불필요
// ─────────────────────────────────────────────
type DocxAssets = {
  chartImage: Buffer | null;
  aiImage: Buffer | null;
};
const docxAssetCache = new Map<string, DocxAssets>();

// ─────────────────────────────────────────────
// 차트 이미지 생성 (QuickChart.io — 설치 불필요)
// ─────────────────────────────────────────────
async function generateChartImage(
  answers: Record<string, any>,
): Promise<Buffer | null> {
  try {
    const entries = Object.entries(answers)
      .filter(([, v]) => v?.value !== null && v?.value !== undefined)
      .slice(0, 12);
    if (entries.length === 0) return null;

    // 숫자 값인지 범주형인지 판단
    const numericEntries = entries.filter(([, v]) => typeof v?.value === "number");
    const isNumeric = numericEntries.length >= entries.length * 0.5;

    let chartConfig: object;

    if (isNumeric) {
      // 수치형 → 가로 막대 차트 (신뢰도 포함)
      const labels = entries.map(([k]) => k);
      const values = entries.map(([, v]) =>
        typeof v?.value === "number" ? v.value : 0,
      );
      const confidences = entries.map(([, v]) =>
        typeof v?.confidence === "number" ? Math.round(v.confidence * 100) : null,
      );

      chartConfig = {
        type: "horizontalBar",
        data: {
          labels,
          datasets: [
            {
              label: "응답값",
              data: values,
              backgroundColor: "rgba(59,130,246,0.75)",
              borderColor: "rgba(59,130,246,1)",
              borderWidth: 1,
            },
            ...(confidences.some((c) => c !== null)
              ? [
                  {
                    label: "신뢰도(%)",
                    data: confidences,
                    backgroundColor: "rgba(16,185,129,0.55)",
                    borderColor: "rgba(16,185,129,1)",
                    borderWidth: 1,
                  },
                ]
              : []),
          ],
        },
        options: {
          plugins: { legend: { position: "bottom" } },
          scales: {
            xAxes: [{ ticks: { beginAtZero: true } }],
          },
        },
      };
    } else {
      // 범주형 → 응답값 분포 도넛 차트
      const valueCounts: Record<string, number> = {};
      for (const [, v] of entries) {
        const val = String(v?.value ?? "미응답");
        valueCounts[val] = (valueCounts[val] || 0) + 1;
      }
      const palette = [
        "rgba(59,130,246,0.8)",
        "rgba(16,185,129,0.8)",
        "rgba(245,158,11,0.8)",
        "rgba(239,68,68,0.8)",
        "rgba(139,92,246,0.8)",
        "rgba(236,72,153,0.8)",
        "rgba(20,184,166,0.8)",
        "rgba(251,146,60,0.8)",
      ];
      chartConfig = {
        type: "doughnut",
        data: {
          labels: Object.keys(valueCounts),
          datasets: [
            {
              data: Object.values(valueCounts),
              backgroundColor: Object.keys(valueCounts).map(
                (_, i) => palette[i % palette.length],
              ),
            },
          ],
        },
        options: {
          plugins: { legend: { position: "right" } },
        },
      };
    }

    const qs = encodeURIComponent(JSON.stringify(chartConfig));
    const url = `https://quickchart.io/chart?w=600&h=320&bkg=white&c=${qs}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch (e) {
    console.warn("[report] chart generation failed:", e);
    return null;
  }
}

// ─────────────────────────────────────────────
// AI 이미지 생성 (DALL-E 3)
// ─────────────────────────────────────────────
async function generateAiImage(
  reportTitle: string,
): Promise<Buffer | null> {
  try {
    if (!process.env.OPENAI_API_KEY) return null;
    const resp = await openai.images.generate({
      model: "dall-e-3",
      prompt:
        `Clean professional policy research illustration for a government report titled "${reportTitle}". ` +
        "Minimalist infographic style, flat colors, no people, no text, Korean public policy theme. " +
        "Use blue and teal as primary colors with white background.",
      size: "1792x1024",
      quality: "standard",
      n: 1,
    });
    const imageUrl = resp.data?.[0]?.url;
    if (!imageUrl) return null;
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) });
    if (!imgRes.ok) return null;
    const ab = await imgRes.arrayBuffer();
    return Buffer.from(ab);
  } catch (e) {
    console.warn("[report] AI image generation failed:", e);
    return null;
  }
}

// ─────────────────────────────────────────────
// DOCX 자산 가져오기 (캐시 우선)
// ─────────────────────────────────────────────
async function getDocxAssets(report: PolicyReport): Promise<DocxAssets> {
  const cached = docxAssetCache.get(report.sessionId);
  if (cached) return cached;

  // 차트와 AI 이미지를 병렬 생성
  const [chartImage, aiImage] = await Promise.all([
    generateChartImage(report.rawAnswers),
    generateAiImage(report.title),
  ]);

  const assets: DocxAssets = { chartImage, aiImage };
  docxAssetCache.set(report.sessionId, assets);
  return assets;
}

export type ReportSection = {
  title: string;
  content: string;
};

export type PolicyReport = {
  title: string;
  subtitle: string;
  date: string;
  respondentId: string;
  sessionId: string;
  executiveSummary: string;
  sections: ReportSection[];
  keyFindings: string[];
  recommendations: string[];
  rawAnswers: Record<string, any>;
};

// ─────────────────────────────────────────────
// AI를 활용한 보고서 내용 생성
// ─────────────────────────────────────────────
export async function generateReportContent(params: {
  sessionId: string;
  respondentId: string;
  transcript: Array<{ role: string; text: string; questionId?: string | null }>;
  answers: Record<string, any>;
  surveyName?: string;
  useCache?: boolean;
}): Promise<PolicyReport> {
  // 캐시 히트 → 즉시 반환 (기본 활성화)
  const useCache = params.useCache !== false;
  if (useCache) {
    const cached = getCachedReport(params.sessionId);
    if (cached) return cached;
  }
  const { sessionId, respondentId, transcript, answers, surveyName } = params;

  const systemPrompt = `당신은 정책 연구원입니다. 제공된 설문 인터뷰 데이터를 분석하여 전문적인 정책보고서를 작성해주세요.
보고서는 다음 JSON 형식으로 작성하세요:
{
  "title": "보고서 제목 (설문 주제 기반)",
  "subtitle": "부제목",
  "executiveSummary": "요약문 (3-5문장)",
  "sections": [
    {
      "title": "섹션 제목",
      "content": "섹션 내용 (마크다운 없이 평문, 3-5문장)"
    }
  ],
  "keyFindings": ["핵심 발견 1", "핵심 발견 2", ...],
  "recommendations": ["정책 제언 1", "정책 제언 2", ...]
}

sections는 다음 항목을 포함하세요:
1. 조사 개요
2. 응답자 특성
3. 주요 현황 분석
4. 문제점 및 불편사항
5. 개선 수요 분석

keyFindings는 3-5개, recommendations는 3-5개로 작성하세요.
모든 내용은 한국어로 작성하고, 정책보고서 형식에 맞는 공식적인 문체를 사용하세요.`;

  const userContent = JSON.stringify(
    {
      surveyName: surveyName || "설문조사",
      respondentId,
      transcript: transcript
        .filter((t) => t.text && t.text.trim())
        .map((t) => `[${t.role === "assistant" ? "진행자" : "응답자"}] ${t.text}`),
      extractedAnswers: answers,
    },
    null,
    2,
  );

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    temperature: 0.3,
  });

  const raw = response.choices[0]?.message?.content || "{}";
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  const now = new Date();
  const date = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;

  const report: PolicyReport = {
    title: parsed.title || `설문 결과 보고서`,
    subtitle: parsed.subtitle || `응답자: ${respondentId}`,
    date,
    respondentId,
    sessionId,
    executiveSummary: parsed.executiveSummary || "",
    sections: Array.isArray(parsed.sections) ? parsed.sections : [],
    keyFindings: Array.isArray(parsed.keyFindings) ? parsed.keyFindings : [],
    recommendations: Array.isArray(parsed.recommendations)
      ? parsed.recommendations
      : [],
    rawAnswers: answers,
  };

  // 생성된 보고서를 캐시에 저장
  if (useCache) {
    setCachedReport(sessionId, report);
  }

  return report;
}

// ─────────────────────────────────────────────
// ITS 스타일 헬퍼: H1 제목 위 구분선 포함 단락
// ─────────────────────────────────────────────
function itsH1(text: string, index: number): Paragraph[] {
  return [
    // 구분선 (제목 위)
    new Paragraph({
      text: "",
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ITS.color.black } },
      spacing: { before: 480, after: 0 },
    }),
    // 제목
    new Paragraph({
      spacing: { before: 120, after: 200 },
      children: [
        new TextRun({
          text: `제${["Ⅰ","Ⅱ","Ⅲ","Ⅳ","Ⅴ","Ⅵ","Ⅶ","Ⅷ"][index] ?? (index+1)+"."}. ${text}`,
          bold: true,
          font: ITS.fontSans,
          size: ITS.size.h1,
          color: ITS.color.black,
        }),
      ],
    }),
  ];
}

function itsH2(text: string, idx1: number, idx2: number): Paragraph {
  return new Paragraph({
    spacing: { before: 320, after: 160 },
    children: [
      new TextRun({
        text: `${idx1+1}.${idx2+1} ${text}`,
        bold: true,
        font: ITS.fontSans,
        size: ITS.size.h2,
        color: ITS.color.black,
      }),
    ],
  });
}

function itsBody(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 180, line: ITS.lineSpacing },
    indent: { firstLine: convertInchesToTwip(0.2) },
    children: [
      new TextRun({
        text,
        font: ITS.font,
        size: ITS.size.body,
        color: ITS.color.black,
      }),
    ],
  });
}

function itsBullet(text: string, symbol = "○"): Paragraph {
  return new Paragraph({
    spacing: { after: 100, line: ITS.lineSpacing },
    indent: { left: convertInchesToTwip(0.3), hanging: convertInchesToTwip(0.2) },
    children: [
      new TextRun({ text: `${symbol} `, font: ITS.fontSans, size: ITS.size.body, color: ITS.color.black }),
      new TextRun({ text, font: ITS.font, size: ITS.size.body, color: ITS.color.black }),
    ],
  });
}

// ─────────────────────────────────────────────
// DOCX 파일 생성 (ITS 정책보고서 스타일)
// ─────────────────────────────────────────────
export async function generateDocx(report: PolicyReport): Promise<Buffer> {
  const bodyChildren: any[] = [];

  // ── 자산(차트 + AI 이미지) 로드 (캐시 우선) ──────
  const { chartImage, aiImage } = await getDocxAssets(report);

  // ══════════════════════════════════════════════
  // 표지 페이지
  // ══════════════════════════════════════════════
  const coverChildren: any[] = [
    // 상단 여백
    new Paragraph({ text: "", spacing: { before: convertInchesToTwip(1.5) } }),

    // AI 생성 커버 이미지
    ...(aiImage
      ? [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 400 },
            children: [
              new ImageRun({
                data: aiImage,
                transformation: { width: 480, height: 270 },
                type: "png",
              }),
            ],
          }),
        ]
      : [new Paragraph({ text: "", spacing: { before: convertInchesToTwip(1.0) } })]),

    // 제목 위 구분선
    new Paragraph({
      text: "",
      border: { bottom: { style: BorderStyle.SINGLE, size: 24, color: ITS.color.black } },
      spacing: { before: 0, after: 200 },
    }),

    // 보고서 제목
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 160 },
      children: [
        new TextRun({
          text: report.title,
          bold: true,
          font: ITS.fontSans,
          size: ITS.size.title,
          color: ITS.color.black,
        }),
      ],
    }),

    // 부제목
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: report.subtitle,
          font: ITS.fontSans,
          size: ITS.size.h2,
          color: ITS.color.gray,
        }),
      ],
    }),

    // 제목 아래 구분선
    new Paragraph({
      text: "",
      border: { bottom: { style: BorderStyle.SINGLE, size: 24, color: ITS.color.black } },
      spacing: { before: 200, after: 0 },
    }),

    // 하단 여백 후 날짜·기관
    new Paragraph({ text: "", spacing: { before: convertInchesToTwip(1.0) } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: report.date,
          font: ITS.fontSans,
          size: ITS.size.h3,
          color: ITS.color.gray,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: "스마트 모빌리티 정책연구소",
          font: ITS.fontSans,
          size: ITS.size.h3,
          color: ITS.color.gray,
        }),
      ],
    }),
  ];

  // ══════════════════════════════════════════════
  // 요약 (본문 첫 섹션)
  // ══════════════════════════════════════════════
  if (report.executiveSummary) {
    bodyChildren.push(...itsH1("요     약", 0));
    bodyChildren.push(itsBody(report.executiveSummary));
  }

  // ══════════════════════════════════════════════
  // 본문 섹션 (조사개요 / 현황분석 / 문제점 / 개선수요)
  // ══════════════════════════════════════════════
  report.sections.forEach((section, si) => {
    bodyChildren.push(...itsH1(section.title, si + 1));
    // 내용을 줄바꿈 기준으로 나눠 단락 처리
    section.content.split("\n").filter(Boolean).forEach((line) => {
      bodyChildren.push(itsBody(line));
    });
  });

  // ══════════════════════════════════════════════
  // 설문 결과 시각화 차트
  // ══════════════════════════════════════════════
  if (chartImage) {
    bodyChildren.push(...itsH1("설문 결과 시각화", report.sections.length + 1));
    bodyChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 160, after: 320 },
        children: [
          new ImageRun({
            data: chartImage,
            transformation: { width: 500, height: 270 },
            type: "png",
          }),
        ],
      }),
    );
    // 차트 캡션
    bodyChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [
          new TextRun({
            text: "[그림 1] 설문 응답 결과 분포",
            font: ITS.fontSans,
            size: ITS.size.small,
            color: ITS.color.lightGray,
          }),
        ],
      }),
    );
  }

  // ══════════════════════════════════════════════
  // 핵심 발견사항
  // ══════════════════════════════════════════════
  if (report.keyFindings.length > 0) {
    const findIdx = report.sections.length + (chartImage ? 2 : 1);
    bodyChildren.push(...itsH1("핵심 발견사항", findIdx));
    report.keyFindings.forEach((f, i) => {
      bodyChildren.push(itsBullet(`${f}`, ["○","○","○","○","○"][i % 5]));
    });
  }

  // ══════════════════════════════════════════════
  // 정책 제언
  // ══════════════════════════════════════════════
  if (report.recommendations.length > 0) {
    const recIdx = report.sections.length + (chartImage ? 3 : 2);
    bodyChildren.push(...itsH1("정책 제언", recIdx));

    const recHeaderRow = new TableRow({
      children: [
        new TableCell({
          width: { size: 1200, type: WidthType.DXA },
          shading: { type: ShadingType.SOLID, color: ITS.color.tableHdr, fill: ITS.color.tableHdr },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: ITS.color.border },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: ITS.color.border },
            left: { style: BorderStyle.SINGLE, size: 4, color: ITS.color.border },
            right: { style: BorderStyle.SINGLE, size: 4, color: ITS.color.border },
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "구분", bold: true, font: ITS.fontSans, size: ITS.size.small, color: ITS.color.black })],
            }),
          ],
        }),
        new TableCell({
          shading: { type: ShadingType.SOLID, color: ITS.color.tableHdr, fill: ITS.color.tableHdr },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: ITS.color.border },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: ITS.color.border },
            left: { style: BorderStyle.SINGLE, size: 4, color: ITS.color.border },
            right: { style: BorderStyle.SINGLE, size: 4, color: ITS.color.border },
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "정책 제언 내용", bold: true, font: ITS.fontSans, size: ITS.size.small, color: ITS.color.black })],
            }),
          ],
        }),
      ],
    });

    const recDataRows = report.recommendations.map((rec, i) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 1200, type: WidthType.DXA },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 2, color: ITS.color.border },
              bottom: { style: BorderStyle.SINGLE, size: 2, color: ITS.color.border },
              left: { style: BorderStyle.SINGLE, size: 4, color: ITS.color.border },
              right: { style: BorderStyle.SINGLE, size: 4, color: ITS.color.border },
            },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: `제언 ${i + 1}`, bold: true, font: ITS.fontSans, size: ITS.size.small, color: ITS.color.black }),
                ],
              }),
            ],
          }),
          new TableCell({
            borders: {
              top: { style: BorderStyle.SINGLE, size: 2, color: ITS.color.border },
              bottom: { style: BorderStyle.SINGLE, size: 2, color: ITS.color.border },
              left: { style: BorderStyle.SINGLE, size: 4, color: ITS.color.border },
              right: { style: BorderStyle.SINGLE, size: 4, color: ITS.color.border },
            },
            children: [
              new Paragraph({
                spacing: { line: ITS.lineSpacing },
                children: [new TextRun({ text: rec, font: ITS.font, size: ITS.size.body, color: ITS.color.black })],
              }),
            ],
          }),
        ],
      }),
    );

    bodyChildren.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [recHeaderRow, ...recDataRows],
      }),
    );
  }

  // ══════════════════════════════════════════════
  // 부록: 원본 응답 데이터
  // ══════════════════════════════════════════════
  if (Object.keys(report.rawAnswers).length > 0) {
    bodyChildren.push(
      new Paragraph({ text: "", spacing: { before: convertInchesToTwip(0.3) } }),
    );
    bodyChildren.push(
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: ITS.color.black } },
        spacing: { before: 480, after: 160 },
        children: [
          new TextRun({
            text: "부록: 추출된 응답 원자료",
            bold: true,
            font: ITS.fontSans,
            size: ITS.size.h2,
            color: ITS.color.black,
          }),
        ],
      }),
    );

    const rawHeader = new TableRow({
      children: ["문항 ID", "응답 값", "신뢰도"].map((label) =>
        new TableCell({
          shading: { type: ShadingType.SOLID, color: ITS.color.tableHdr, fill: ITS.color.tableHdr },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: ITS.color.border },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: ITS.color.border },
            left: { style: BorderStyle.SINGLE, size: 4, color: ITS.color.border },
            right: { style: BorderStyle.SINGLE, size: 4, color: ITS.color.border },
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: label, bold: true, font: ITS.fontSans, size: ITS.size.small, color: ITS.color.black })],
            }),
          ],
        }),
      ),
    });

    const rawRows = Object.entries(report.rawAnswers).map(([key, val]: [string, any]) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 2000, type: WidthType.DXA },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 2, color: ITS.color.border },
              bottom: { style: BorderStyle.SINGLE, size: 2, color: ITS.color.border },
              left: { style: BorderStyle.SINGLE, size: 4, color: ITS.color.border },
              right: { style: BorderStyle.SINGLE, size: 4, color: ITS.color.border },
            },
            children: [new Paragraph({ children: [new TextRun({ text: key, bold: true, font: ITS.fontSans, size: ITS.size.footer, color: ITS.color.black })] })],
          }),
          new TableCell({
            borders: {
              top: { style: BorderStyle.SINGLE, size: 2, color: ITS.color.border },
              bottom: { style: BorderStyle.SINGLE, size: 2, color: ITS.color.border },
              left: { style: BorderStyle.SINGLE, size: 4, color: ITS.color.border },
              right: { style: BorderStyle.SINGLE, size: 4, color: ITS.color.border },
            },
            children: [new Paragraph({ children: [new TextRun({ text: String(val?.value ?? "-"), font: ITS.font, size: ITS.size.footer, color: ITS.color.black })] })],
          }),
          new TableCell({
            width: { size: 800, type: WidthType.DXA },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 2, color: ITS.color.border },
              bottom: { style: BorderStyle.SINGLE, size: 2, color: ITS.color.border },
              left: { style: BorderStyle.SINGLE, size: 4, color: ITS.color.border },
              right: { style: BorderStyle.SINGLE, size: 4, color: ITS.color.border },
            },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: typeof val?.confidence === "number" ? `${Math.round(val.confidence * 100)}%` : "-",
                    font: ITS.fontSans,
                    size: ITS.size.footer,
                    color: ITS.color.black,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    );

    bodyChildren.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [rawHeader, ...rawRows] }));
  }

  // ══════════════════════════════════════════════
  // Document 조립 (표지 섹션 + 본문 섹션 분리)
  // ══════════════════════════════════════════════
  const doc = new Document({
    numbering: { config: [] },
    sections: [
      // ── 표지 섹션 (페이지 번호 없음) ──
      {
        properties: {
          page: {
            margin: {
              top: ITS.margin.top,
              bottom: ITS.margin.bottom,
              left: ITS.margin.left,
              right: ITS.margin.right,
              header: ITS.margin.header,
              footer: ITS.margin.footer,
            },
          },
        },
        children: coverChildren,
      },
      // ── 본문 섹션 (푸터 페이지 번호) ──
      {
        properties: {
          page: {
            margin: {
              top: ITS.margin.top,
              bottom: ITS.margin.bottom,
              left: ITS.margin.left,
              right: ITS.margin.right,
              header: ITS.margin.header,
              footer: ITS.margin.footer,
            },
            pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: ITS.fontSans,
                    size: ITS.size.footer,
                    color: ITS.color.lightGray,
                  }),
                ],
              }),
            ],
          }),
        },
        children: bodyChildren,
      },
    ],
    styles: {
      default: {
        document: {
          run: { font: ITS.font, size: ITS.size.body, color: ITS.color.black },
          paragraph: { spacing: { line: ITS.lineSpacing } },
        },
      },
    },
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer as unknown as Buffer;
}
