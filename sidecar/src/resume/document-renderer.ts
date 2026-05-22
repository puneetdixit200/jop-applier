import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CoverLetterRenderInput,
  CoverLetterRenderResult,
  ResumeRenderInput,
  ResumeRenderResult,
} from "./application-document-generator.js";

export type DocumentRendererOptions = {
  outputDir: string;
  resumeTemplate?: ResumeTemplateId;
};

export type ResumeTemplateId = "classic" | "modern" | "creative" | "academic" | "compact";

export async function renderResumeArtifacts(
  input: ResumeRenderInput,
  options: DocumentRendererOptions,
): Promise<ResumeRenderResult> {
  const directory = applicationDirectory(options.outputDir, input.context.applicationId);
  await mkdir(directory, { recursive: true });

  const pdfFileName = `resume-v${input.context.resumeVersion}.pdf`;
  const jsonFileName = `resume-v${input.context.resumeVersion}.json`;
  const pdfPath = join(directory, pdfFileName);
  const jsonPath = join(directory, jsonFileName);

  const template = options.resumeTemplate ?? "classic";
  await writeFile(pdfPath, buildPdf(`Tailored Resume - ${titleCase(template)}`, resumePdfLines(input, template)), "utf8");
  await writeFile(jsonPath, JSON.stringify(resumeFormFillJson(input), null, 2), "utf8");

  return {
    pdfPath,
    pdfFileName,
    jsonPath,
    jsonFileName,
  };
}

export async function renderCoverLetterPdf(
  input: CoverLetterRenderInput,
  options: DocumentRendererOptions,
): Promise<CoverLetterRenderResult> {
  const directory = applicationDirectory(options.outputDir, input.context.applicationId);
  await mkdir(directory, { recursive: true });

  const fileName = `cover-letter-v${input.context.resumeVersion}.pdf`;
  const pdfPath = join(directory, fileName);
  await writeFile(pdfPath, buildPdf("Cover Letter", coverLetterPdfLines(input)), "utf8");

  return {
    pdfPath,
    fileName,
  };
}

function applicationDirectory(outputDir: string, applicationId: string): string {
  return join(outputDir, safePathSegment(applicationId));
}

function safePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function resumeFormFillJson(input: ResumeRenderInput) {
  return {
    applicationId: input.context.applicationId,
    jobId: input.context.jobId,
    companyName: input.context.companyName,
    formFillProfile: {
      fullName: input.context.profile.fullName ?? null,
      headline: input.context.profile.headline ?? null,
      email: stringOrNull(input.context.profile.email),
      phone: stringOrNull(input.context.profile.phone),
      location: stringOrNull(input.context.profile.location),
      summary: input.resume.summary,
      skills: input.resume.skills,
    },
    job: input.context.job,
    resume: input.resume,
    tailoringNotes: input.resume.tailoringNotes,
  };
}

function resumePdfLines(input: ResumeRenderInput, template: ResumeTemplateId): string[] {
  const baseLines = [
    stringOrNull(input.context.profile.fullName) ?? "Candidate",
    input.context.profile.headline,
    input.context.profile.email,
    input.context.profile.phone,
    input.context.profile.location,
    "",
    input.context.job.title,
    input.context.companyName,
    "",
    input.resume.summary,
    "",
    "Skills",
    input.resume.skills.join(", "),
    "",
    ...sectionLines("Experience", input.resume.experience),
    ...sectionLines("Projects", input.resume.projects),
    ...sectionLines("Education", input.resume.education),
    ...sectionLines("Certifications", input.resume.certifications),
    ...sectionLines("Tailoring Notes", input.resume.tailoringNotes),
  ].filter((line): line is string => typeof line === "string");

  if (template === "compact") {
    return baseLines.filter((line) => line.trim().length > 0);
  }
  if (template === "academic") {
    return [...sectionLines("Education", input.resume.education), ...baseLines];
  }
  if (template === "creative") {
    return ["Portfolio-focused resume", ...baseLines];
  }
  if (template === "modern") {
    return ["Profile", ...baseLines];
  }
  return baseLines;
}

function coverLetterPdfLines(input: CoverLetterRenderInput): string[] {
  return [
    input.context.profile.fullName,
    input.context.job.title,
    input.context.companyName,
    "",
    ...input.coverLetter.split(/\r?\n/),
  ].filter((line): line is string => typeof line === "string");
}

function sectionLines(title: string, value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [];
  }

  return [title, ...value.map(readableValue), ""];
}

function readableValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value === null || value === undefined) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map(readableValue).filter(Boolean).join("; ");
  }

  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, entry]) => `${titleCase(key)}: ${readableValue(entry)}`)
      .filter((entry) => !entry.endsWith(": "))
      .join("; ");
  }

  return String(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildPdf(title: string, lines: string[]): string {
  const content = pdfContentStream(title, lines);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`,
  ];

  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body, "utf8"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(body, "utf8");
  const xrefRows = offsets.map((offset, index) => {
    const suffix = index === 0 ? "65535 f" : "00000 n";
    return `${offset.toString().padStart(10, "0")} ${suffix} `;
  });

  return [
    body,
    `xref\n0 ${objects.length + 1}`,
    ...xrefRows,
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
    "",
  ].join("\n");
}

function pdfContentStream(title: string, lines: string[]): string {
  const escapedLines = [title, "", ...lines]
    .flatMap((line) => wrapLine(line))
    .slice(0, 38)
    .map((line) => `0 -16 Td (${escapePdfText(line)}) Tj`);

  return ["BT", "/F1 12 Tf", "50 760 Td", ...escapedLines, "ET"].join("\n");
}

function wrapLine(value: string): string[] {
  const line = value.trim();
  if (line.length <= 90) {
    return [line];
  }

  const chunks: string[] = [];
  for (let index = 0; index < line.length; index += 90) {
    chunks.push(line.slice(index, index + 90));
  }
  return chunks;
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
