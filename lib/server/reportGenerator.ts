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
} from "docx";

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
// DOCX 파일 생성
// ─────────────────────────────────────────────
export async function generateDocx(report: PolicyReport): Promise<Buffer> {
  const children: any[] = [];

  // ── 자산(차트 + AI 이미지) 로드 (캐시 우선) ──────
  const { chartImage, aiImage } = await getDocxAssets(report);

  // ── AI 이미지 (표지 상단) ─────────────────────
  if (aiImage) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 160, after: 200 },
        children: [
          new ImageRun({
            data: aiImage,
            transformation: { width: 560, height: 320 },
            type: "png",
          }),
        ],
      }),
    );
  }

  // ── 표지 ──────────────────────────────────────
  children.push(
    new Paragraph({
      text: report.title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 200 },
    }),
  );
  children.push(
    new Paragraph({
      text: report.subtitle,
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: report.subtitle,
          color: "475569",
          size: 24,
        }),
      ],
    }),
  );
  children.push(
    new Paragraph({
      text: report.date,
      alignment: AlignmentType.CENTER,
      spacing: { after: 480 },
      children: [
        new TextRun({
          text: report.date,
          color: "64748b",
          size: 22,
        }),
      ],
    }),
  );

  // ── 구분선 ────────────────────────────────────
  children.push(
    new Paragraph({
      text: "",
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 2, color: "e2e8f0" },
      },
      spacing: { after: 360 },
    }),
  );

  // ── 요약문 ────────────────────────────────────
  if (report.executiveSummary) {
    children.push(
      new Paragraph({
        text: "요 약",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 240, after: 160 },
      }),
    );
    children.push(
      new Paragraph({
        text: report.executiveSummary,
        spacing: { after: 320 },
        children: [
          new TextRun({
            text: report.executiveSummary,
            size: 22,
          }),
        ],
      }),
    );
  }

  // ── 본문 섹션 ─────────────────────────────────
  for (const section of report.sections) {
    children.push(
      new Paragraph({
        text: section.title,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 320, after: 160 },
      }),
    );
    children.push(
      new Paragraph({
        text: section.content,
        spacing: { after: 240 },
        children: [
          new TextRun({
            text: section.content,
            size: 22,
          }),
        ],
      }),
    );
  }

  // ── 설문 결과 차트 ───────────────────────────
  if (chartImage) {
    children.push(
      new Paragraph({
        text: "설문 결과 시각화",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 320, after: 160 },
      }),
    );
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 320 },
        children: [
          new ImageRun({
            data: chartImage,
            transformation: { width: 540, height: 290 },
            type: "png",
          }),
        ],
      }),
    );
  }

  // ── 핵심 발견 ─────────────────────────────────
  if (report.keyFindings.length > 0) {
    children.push(
      new Paragraph({
        text: "핵심 발견사항",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 320, after: 160 },
      }),
    );
    for (let i = 0; i < report.keyFindings.length; i++) {
      children.push(
        new Paragraph({
          spacing: { after: 120 },
          children: [
            new TextRun({
              text: `${i + 1}. ${report.keyFindings[i]}`,
              size: 22,
            }),
          ],
        }),
      );
    }
  }

  // ── 정책 제언 ─────────────────────────────────
  if (report.recommendations.length > 0) {
    children.push(
      new Paragraph({
        text: "정책 제언",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 320, after: 160 },
      }),
    );

    const tableRows = report.recommendations.map((rec, i) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 800, type: WidthType.DXA },
            shading: { type: ShadingType.SOLID, color: "f1f5f9", fill: "f1f5f9" },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: `제언 ${i + 1}`,
                    bold: true,
                    size: 20,
                    color: "334155",
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: rec, size: 20 })],
              }),
            ],
          }),
        ],
      }),
    );

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: tableRows,
      }),
    );
  }

  // ── 원본 응답 데이터 ──────────────────────────
  if (Object.keys(report.rawAnswers).length > 0) {
    children.push(
      new Paragraph({
        text: "부록: 추출된 응답 데이터",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 480, after: 160 },
      }),
    );

    const headerRow = new TableRow({
      children: [
        new TableCell({
          shading: { type: ShadingType.SOLID, color: "0f172a", fill: "0f172a" },
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: "문항 ID", bold: true, color: "ffffff", size: 20 }),
              ],
            }),
          ],
        }),
        new TableCell({
          shading: { type: ShadingType.SOLID, color: "0f172a", fill: "0f172a" },
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: "응답 값", bold: true, color: "ffffff", size: 20 }),
              ],
            }),
          ],
        }),
        new TableCell({
          shading: { type: ShadingType.SOLID, color: "0f172a", fill: "0f172a" },
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: "신뢰도", bold: true, color: "ffffff", size: 20 }),
              ],
            }),
          ],
        }),
      ],
    });

    const dataRows = Object.entries(report.rawAnswers).map(([key, val]: [string, any]) =>
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: key, size: 18, bold: true })],
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: String(val?.value ?? "-"),
                    size: 18,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text:
                      typeof val?.confidence === "number"
                        ? `${Math.round(val.confidence * 100)}%`
                        : "-",
                    size: 18,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    );

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [headerRow, ...dataRows],
      }),
    );
  }

  const doc = new Document({
    sections: [{ children }],
    styles: {
      default: {
        document: {
          run: {
            font: "맑은 고딕",
            size: 22,
            color: "0f172a",
          },
          paragraph: {
            spacing: { line: 360 },
          },
        },
      },
    },
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer as unknown as Buffer;
}
