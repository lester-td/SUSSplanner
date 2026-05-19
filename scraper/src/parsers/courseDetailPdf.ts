import type { AssessmentComponentRecord, ComponentGroup, CourseDetailParseResult, ScheduleType } from "../lib/types.js";

interface CourseDetailOptions {
  courseCode: string;
  sourceUrl: string;
  scheduleType?: ScheduleType;
}


function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanPdfArtifacts(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\u00ad/g, "")
    .replace(/\uFFFE/g, "")
    .replace(/￾/g, "")
    .replace(/\r/g, "");
}

function cleanValue(value: string): string {
  return cleanPdfArtifacts(value)
    .replace(/\s+/g, " ")
    .replace(/^[:\-|]+\s*/, "")
    .replace(/\s*[:\-|]+\s*$/, "")
    .trim();
}

function normaliseLines(text: string): string[] {
  return cleanPdfArtifacts(text)
    .split("\n")
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function normaliseText(text: string): string {
  // Keep line boundaries for section parsing but remove common PDF garbage.
  return cleanPdfArtifacts(text)
    .split("\n")
    .map(line => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n");
}

export function isNoRecordFoundText(text: string): boolean {
  const lines = normaliseLines(text);
  return lines.length > 0 && lines.some(line => /^No\s+Record\s+Found$/i.test(line));
}

function normalizeParagraph(text: string | null | undefined): string | null {
  if (!text) return null;

  const cleaned = cleanPdfArtifacts(text)
    .split("\n")
    .map(line => line.trim())
    .filter(line => line && !isPageMarker(line) && !isPageNumberLine(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || null;
}

function isPageMarker(line: string): boolean {
  return /^--- PAGE \d+\s+(TEXT|TABLES) ---$/i.test(line.trim());
}

function isPageNumberLine(line: string): boolean {
  return /^Page\s+\d+\s+of\s+\d+$/i.test(line.trim());
}

function findFirst(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanValue(match[1]);
  }
  return null;
}

function toNumber(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

const SECTION_HEADERS = [
  "Course Synopsis",
  "Synopsis",
  "Course Topics",
  "Topics",
  "Textbooks",
  "References",
  "Recommended Textbooks",
  "Learning Outcome",
  "Learning Outcomes",
  "Course Learning Outcomes",
  "Assessment Strategies",
  "Assessment Strategy",
  "Assessment",
  "Assessment Components",
  "Presentation Pattern",
  "Course Level",
  "Credit Units",
  "Credit Unit",
  "Language"
];

function extractSection(text: string, possibleHeaders: string[]): string | null {
  const headersPattern = SECTION_HEADERS.map(escapeRegex).join("|");

  for (const header of possibleHeaders) {
    const re = new RegExp(
      `(?:^|\\n)\\s*${escapeRegex(header)}\\s*(?:[-–—][^:\\n]+)?\\s*[:\-]?\\s*\\n?([\\s\\S]*?)(?=\\n\\s*(?:${headersPattern})\\s*(?:[-–—][^:\\n]+)?\\s*[:\-]?\\s*(?:\\n|$)|$)`,
      "i"
    );
    const match = text.match(re);
    if (match?.[1]) {
      const section = match[1]
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean)
        .filter(line => !isPageMarker(line))
        .filter(line => !isPageNumberLine(line))
        .join("\n")
        .trim();
      if (section) return section;
    }
  }

  return null;
}

function extractAssessmentSection(text: string): string | null {
  const match = text.match(/(?:^|\n)\s*Assessment\s+Strategies\s*(?:[-–—][^:\n]+)?\s*:\s*\n?([\s\S]*?)(?=\n\s*\*The information listed|$)/i);
  if (match?.[1]) return match[1].trim();
  return extractSection(text, ["Assessment Strategies", "Assessment Strategy", "Assessment Components", "Assessment"]);
}

function parseBulletSection(section: string | null): string[] | null {
  if (!section) return null;

  const lines = cleanPdfArtifacts(section)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !isPageMarker(line))
    .filter(line => !isPageNumberLine(line));

  const items: string[] = [];

  for (const line of lines) {
    const bulletMatch = line.match(/^(?:[●•\-*]|\d+[.)]|[a-z][.)])\s*(.+)$/i);

    if (bulletMatch) {
      items.push(bulletMatch[1].trim());
    } else if (items.length > 0) {
      // A line without a bullet is usually a PDF line-wrap continuation.
      items[items.length - 1] += ` ${line}`;
    } else {
      items.push(line);
    }
  }

  const cleaned = items
    .map(item => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return cleaned.length > 0 ? cleaned : null;
}

function classifyAssessmentMode(name: string): string {
  const upper = name.toUpperCase();
  if (upper.includes("GBA") || upper.includes("GROUP BASED") || upper.includes("GROUP-BASED")) return "GBA";
  if (upper.includes("TMA") || upper.includes("TUTOR MARKED") || upper.includes("TUTOR-MARKED")) return "TMA";
  if (upper.includes("ECA") || upper.includes("END COURSE") || upper.includes("END-OF-COURSE")) return "ECA";
  if (upper.includes("PCT") || upper.includes("PARTICIPATION")) return "PCT";
  if (upper.includes("PRE") && upper.includes("QUIZ")) return "Pre-class Quiz";
  if (upper.includes("QUIZ")) return "Quiz";
  if (upper.includes("PROCTORED") && upper.includes("ONLINE") && upper.includes("EXAM")) return "Proctored Online Exam";
  if (upper.includes("WRITTEN") && upper.includes("EXAM")) return "Written Exam";
  if (upper.includes("ONLINE") && upper.includes("EXAM")) return "Online Exam";
  if (upper.includes("EXAM")) return "Exam";
  if (upper.includes("ASSIGNMENT")) return "Assignment";
  return cleanValue(name);
}

function classifyComponentGroup(name: string, explicitGroup?: ComponentGroup): ComponentGroup {
  if (explicitGroup) return explicitGroup;
  const upper = name.toUpperCase();
  if (
    upper.includes("WRITTEN EXAM") ||
    upper.includes("ONLINE EXAM") ||
    upper.includes("PROCTORED ONLINE EXAM") ||
    upper === "EXAM" ||
    upper.includes("EXAMINATION") ||
    upper.includes("ECA") ||
    upper.includes("END COURSE") ||
    upper.includes("END-OF-COURSE")
  ) {
    return "OES";
  }
  return "OCAS";
}

function removeAssessmentNoise(name: string): string {
  return cleanValue(name)
    .replace(/^(assessment|component|components|strategy|strategies|weightage|allocation|weight|overall|continuous|examinable|score|ocas|oes)\b[:\-\s]*/i, "")
    .replace(/\b(assessment|component|components|strategy|strategies|weightage|allocation|weight|overall|continuous|examinable|score|ocas|oes)\b$/i, "")
    .replace(/[|]+/g, " ")
    .trim();
}

function parseWeight(value: string | undefined): number | null {
  if (!value) return null;

  // Some pdfplumber table cells include footer text, e.g. "50 Page 2 of 3".
  // Remove page markers before reading the assessment weight.
  const cleaned = cleanPdfArtifacts(value)
    .replace(/Page\s+\d+\s+of\s+\d+/gi, " ")
    .replace(/---\s*PAGE\s+\d+\s+(?:TEXT|TABLES)\s*---/gi, " ")
    .trim();

  const matches = [...cleaned.matchAll(/\b(\d+(?:\.\d+)?)\b\s*%?/g)];
  if (matches.length === 0) return null;

  // After removing page markers, the last remaining number should be the weight.
  const weight = Number(matches[matches.length - 1][1]);
  if (Number.isNaN(weight) || weight <= 0 || weight > 100) return null;
  return weight;
}

function assessmentKey(assessment: AssessmentComponentRecord): string {
  return [
    assessment.componentName.toUpperCase().replace(/\s+/g, " ").trim(),
    assessment.weightPercentage,
    assessment.componentGroup
  ].join("#");
}

function makeAssessment(
  courseCode: string,
  scheduleType: ScheduleType,
  rawName: string,
  weight: number,
  sortOrder: number,
  explicitGroup?: ComponentGroup
): AssessmentComponentRecord | null {
  let componentName = removeAssessmentNoise(rawName)
    .replace(new RegExp(`^${escapeRegex(courseCode)}\\b`, "i"), "")
    .replace(/^(and|or|of|for|the)\b\s*/i, "")
    .replace(/[,;:]$/, "")
    .trim();

  if (!componentName || Number.isNaN(weight)) return null;
  if (componentName.length > 100) return null;
  if (/^(total|subtotal|components description|description|weightage allocation)$/i.test(componentName)) return null;
  if (weight <= 0 || weight > 100) return null;

  return {
    courseCode: courseCode.toUpperCase(),
    scheduleType,
    componentName,
    componentGroup: classifyComponentGroup(componentName, explicitGroup),
    assessmentMode: classifyAssessmentMode(componentName),
    weightPercentage: weight,
    sortOrder
  };
}

function parsePipeAssessmentRows(source: string, courseCode: string, scheduleType: ScheduleType): AssessmentComponentRecord[] {
  const assessments: AssessmentComponentRecord[] = [];
  const seen = new Set<string>();
  let currentGroup: ComponentGroup = "OCAS";
  let sortOrder = 1;
  let started = false;

  for (const line of normaliseLines(source)) {
    if (!line.includes("|")) continue;

    const cols = line.split("|").map(cleanValue);
    const joined = cols.filter(Boolean).join(" ");
    const firstCol = cols[0] ?? "";
    const lastNonEmpty = [...cols].reverse().find(Boolean) ?? "";

    if (/assessment\s+strateg/i.test(joined) || /components\s+description\s+weightage/i.test(joined)) {
      started = true;
      continue;
    }

    if (/overall\s+continuous/i.test(joined)) {
      started = true;
      currentGroup = "OCAS";
    }

    if (/overall\s+examinable/i.test(joined)) {
      started = true;
      currentGroup = "OES";
    }

    if (!started) continue;

    if (/^total\b/i.test(firstCol) || /^total\b/i.test(joined)) {
      // Stop after the first complete assessment table. This prevents duplicate totals when a PDF exposes
      // multiple duplicated table renderings or repeated assessment sections.
      break;
    }

    if (/components\s+description\s+weightage/i.test(joined)) continue;

    const weight = parseWeight(lastNonEmpty);
    if (weight === null) continue;

    // Prefer the second column, because pdfplumber usually returns:
    // Overall Continuous Assessment | PRE-CLASS QUIZ 1 | 2
    // For continuation rows, the first column is often blank and the second column is the component.
    let rawName = cols[1] ?? "";
    if (!rawName || /^\d+(?:\.\d+)?%?$/.test(rawName)) {
      rawName = cols.slice(0, -1).filter(Boolean).join(" ");
    }

    rawName = rawName
      .replace(/^Overall\s+Continuous\s+Assessment\s*/i, "")
      .replace(/^Overall\s+Examinable\s+Components?\s*/i, "")
      .replace(/^Components\s+Description\s*/i, "")
      .trim();

    const assessment = makeAssessment(courseCode, scheduleType, rawName, weight, sortOrder, currentGroup);
    if (!assessment) continue;

    const key = assessmentKey(assessment);
    if (seen.has(key)) continue;
    seen.add(key);
    assessments.push(assessment);
    sortOrder += 1;
  }

  return assessments;
}

function parseTextAssessmentRows(source: string, courseCode: string, scheduleType: ScheduleType): AssessmentComponentRecord[] {
  const assessments: AssessmentComponentRecord[] = [];
  const seen = new Set<string>();
  let currentGroup: ComponentGroup = "OCAS";
  let sortOrder = 1;
  let started = false;

  for (const line of normaliseLines(source)) {
    if (/assessment\s+strateg/i.test(line)) {
      started = true;
      continue;
    }

    if (/overall\s+continuous/i.test(line)) {
      started = true;
      currentGroup = "OCAS";
      continue;
    }

    if (/overall\s+examinable/i.test(line)) {
      started = true;
      currentGroup = "OES";
      continue;
    }

    if (!started) continue;
    if (/components\s+description\s+weightage/i.test(line)) continue;

    if (/^total\s+\d+(?:\.\d+)?\s*%?$/i.test(line)) {
      break;
    }

    const match = line.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*%?$/);
    if (!match) continue;

    const rawName = match[1]
      .replace(/^Overall\s+Continuous\s+Assessment\s*/i, "")
      .replace(/^Overall\s+Examinable\s+Components?\s*/i, "")
      .trim();
    const weight = Number(match[2]);
    const assessment = makeAssessment(courseCode, scheduleType, rawName, weight, sortOrder, currentGroup);
    if (!assessment) continue;

    const key = assessmentKey(assessment);
    if (seen.has(key)) continue;
    seen.add(key);
    assessments.push(assessment);
    sortOrder += 1;
  }

  return assessments;
}

function dedupeAssessments(assessments: AssessmentComponentRecord[]): AssessmentComponentRecord[] {
  const seen = new Set<string>();
  const result: AssessmentComponentRecord[] = [];

  for (const assessment of assessments) {
    const key = assessmentKey(assessment);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ...assessment, sortOrder: result.length + 1 });
  }

  return result;
}

function parseAssessments(section: string | null, fullText: string, courseCode: string, scheduleType: ScheduleType): AssessmentComponentRecord[] {
  // Prefer pdfplumber table rows from the full extracted text. They preserve columns like:
  // Overall Continuous Assessment | PRE-CLASS QUIZ 1 | 2
  const fullTextTableAssessments = dedupeAssessments(parsePipeAssessmentRows(fullText, courseCode, scheduleType));
  if (fullTextTableAssessments.length > 0) return fullTextTableAssessments;

  const source = section && section.length > 20 ? section : fullText;
  const sectionTableAssessments = dedupeAssessments(parsePipeAssessmentRows(source, courseCode, scheduleType));
  if (sectionTableAssessments.length > 0) return sectionTableAssessments;

  return dedupeAssessments(parseTextAssessmentRows(source, courseCode, scheduleType));
}

function isMetadataLine(line: string): boolean {
  return /^(level|credit units?|language|presentation pattern|synopsis|topics|textbooks|learning outcome|assessment strategies)\b[:\s]*/i.test(line.trim());
}

function parseCourseName(text: string, courseCode: string): string | null {
  const direct = findFirst(text, [
    /Course\s*Title\s*[:\-|]\s*([^\n|]+)/i,
    /Course\s*Name\s*[:\-|]\s*([^\n|]+)/i,
    /Title\s*[:\-|]\s*([^\n|]+)/i
  ]);
  if (direct) return direct;

  const lines = normaliseLines(text);
  const codeUpper = courseCode.toUpperCase();

  const codeIndex = lines.findIndex(line => line.toUpperCase().startsWith(codeUpper));
  if (codeIndex >= 0) {
    const parts: string[] = [];
    const firstPart = cleanValue(lines[codeIndex].replace(new RegExp(`^${escapeRegex(codeUpper)}\\s*`, "i"), ""));
    if (firstPart && !isMetadataLine(firstPart)) parts.push(firstPart);

    // Course names sometimes wrap to the next line, especially bilingual titles, e.g.
    // "MAV555 Data Integration for Enterprise Automation 企业自动" + "化数据集成".
    for (let i = codeIndex + 1; i < Math.min(lines.length, codeIndex + 4); i += 1) {
      const line = cleanValue(lines[i]);
      if (!line || isMetadataLine(line) || isPageMarker(line) || isPageNumberLine(line)) break;
      // Avoid accidentally appending very long content if the header parse went wrong.
      if (line.length > 120) break;
      parts.push(line);
    }

    const candidate = cleanValue(parts.join(" "));
    if (candidate.length > 2 && !/course code|school|programme|level|credit units/i.test(candidate)) return candidate;
  }

  // Some extracted first lines join the marker and course title oddly; try any line containing the code.
  const embedded = lines.find(line => new RegExp(`\\b${escapeRegex(codeUpper)}\\b`, "i").test(line));
  if (embedded) {
    const candidate = cleanValue(embedded.replace(new RegExp(`.*?\\b${escapeRegex(codeUpper)}\\b\\s*`, "i"), ""));
    if (candidate.length > 2 && !/level|credit units|language|presentation pattern/i.test(candidate)) return candidate;
  }

  return null;
}

export function parseCourseDetailText(text: string, opts: CourseDetailOptions): CourseDetailParseResult {
  const normalised = normaliseText(text);
  const warnings: string[] = [];
  const courseCode = opts.courseCode.toUpperCase();
  const scheduleType: ScheduleType = opts.scheduleType ?? "evening";

  const courseName = parseCourseName(normalised, courseCode);

  const courseLevel = findFirst(normalised, [
    /Course\s*Level\s*[:\-|]\s*([^\n|]+)/i,
    /Level\s*[:\-|]\s*([^\n|]+)/i
  ]);

  const creditUnitsText = findFirst(normalised, [
    /Credit\s*Units?\s*[:\-|]\s*([^\n|]+)/i,
    /CU\s*[:\-|]\s*([^\n|]+)/i,
    /Credit\s*Unit\(s\)\s*[:\-|]\s*([^\n|]+)/i
  ]);

  const presentationPattern = findFirst(normalised, [
    /Presentation\s*Pattern\s*[:\-|]\s*([^\n|]+)/i
  ]);

  const courseSynopsisSection = extractSection(normalised, ["Course Synopsis", "Synopsis"]);
  const courseTopicsSection = extractSection(normalised, ["Course Topics", "Topics"]);
  const learningOutcomesSection = extractSection(normalised, ["Learning Outcomes", "Learning Outcome", "Course Learning Outcomes"]);
  const assessmentSection = extractAssessmentSection(normalised);

  let assessments = parseAssessments(assessmentSection, normalised, courseCode, scheduleType);
  const total = assessments.reduce((sum, item) => sum + item.weightPercentage, 0);

  if (!courseName) warnings.push(`Course name not confidently extracted for ${courseCode} (${scheduleType}).`);
  if (!courseSynopsisSection) warnings.push(`Course synopsis section not found for ${courseCode} (${scheduleType}).`);
  if (assessments.length === 0) warnings.push(`Assessment components not found for ${courseCode} (${scheduleType}).`);
  if (assessments.length > 0 && Math.abs(total - 100) > 0.01) {
    warnings.push(`Assessment total for ${courseCode} (${scheduleType}) is ${total}, not 100. Assessment rows were skipped to avoid importing bad data.`);
    assessments = [];
  }

  const topics = parseBulletSection(courseTopicsSection);
  const learningOutcomes = parseBulletSection(learningOutcomesSection);
  if (!topics || topics.length === 0) warnings.push(`Course topics not found for ${courseCode} (${scheduleType}).`);
  if (!learningOutcomes || learningOutcomes.length === 0) warnings.push(`Learning outcomes not found for ${courseCode} (${scheduleType}).`);

  return {
    course: {
      courseCode,
      courseName,
      courseLevel,
      creditUnits: toNumber(creditUnitsText),
      presentationPattern,
      courseSynopsis: normalizeParagraph(courseSynopsisSection),
      courseTopics: topics,
      learningOutcomes,
      synopsisUrl: opts.sourceUrl,
      lastScrapedAt: new Date().toISOString()
    },
    scheduleType,
    sourceUrl: opts.sourceUrl,
    assessments,
    warnings
  };
}

export function buildCourseDetailPdfUrl(courseCode: string, isft: 0 | 1 = 0): string {
  const encoded = encodeURIComponent(courseCode.toUpperCase());
  return `https://sims1.suss.edu.sg/eservice/public/viewcourse/viewcourse.aspx?crsecd=${encoded}&viewtype=pdf&isft=${isft}`;
}

export function isftForScheduleType(scheduleType: ScheduleType): 0 | 1 {
  return scheduleType === "daytime" ? 1 : 0;
}

// Backwards-compatible alias for older imports.
export const parseCourseDetailPdfText = parseCourseDetailText;
