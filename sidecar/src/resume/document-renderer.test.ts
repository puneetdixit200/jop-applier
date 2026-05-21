import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  renderCoverLetterPdf,
  renderResumeArtifacts,
} from "./document-renderer.js";

const tempDirs: string[] = [];

const context = {
  applicationId: "app-1",
  jobId: "job-1",
  companyName: "Northstar Labs",
  resumeVersion: 3,
  profile: {
    fullName: "Asha Rao",
    headline: "React and Tauri engineer",
    email: "asha@example.com",
    skills: ["React", "TypeScript"],
  },
  job: {
    title: "Desktop Automation Engineer",
    companyName: "Northstar Labs",
    description: "Build Tauri and Rust automation.",
    requirements: ["React", "Rust", "Tauri"],
  },
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("document renderers", () => {
  it("writes tailored resume PDF and application-form JSON artifacts", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "careercaveman-render-"));
    tempDirs.push(outputDir);

    const result = await renderResumeArtifacts(
      {
        context,
        resume: {
          summary: "React and Rust desktop engineer.",
          skills: ["React", "TypeScript", "Rust", "Tauri"],
          experience: [
            {
              company: "Orbit Apps",
              title: "Frontend Engineer",
              highlights: ["Built a Tauri workflow dashboard"],
            },
          ],
          tailoringNotes: ["Emphasized local-first desktop automation"],
        },
      },
      { outputDir },
    );

    expect(result).toEqual({
      pdfPath: join(outputDir, "app-1", "resume-v3.pdf"),
      pdfFileName: "resume-v3.pdf",
      jsonPath: join(outputDir, "app-1", "resume-v3.json"),
      jsonFileName: "resume-v3.json",
    });
    await expect(readFile(result.pdfPath, "utf8")).resolves.toSatisfy((value) => {
      expect(typeof value).toBe("string");
      const pdf = value as string;
      expect(pdf).toContain("%PDF-1.4");
      expect(pdf).toContain("Asha Rao");
      expect(pdf).toContain("Desktop Automation Engineer");
      expect(pdf).toContain("React and Rust desktop engineer.");
      return true;
    });
    await expect(readFile(result.jsonPath, "utf8").then(JSON.parse)).resolves.toMatchObject({
      applicationId: "app-1",
      jobId: "job-1",
      companyName: "Northstar Labs",
      formFillProfile: {
        fullName: "Asha Rao",
        email: "asha@example.com",
        summary: "React and Rust desktop engineer.",
        skills: ["React", "TypeScript", "Rust", "Tauri"],
      },
      job: {
        title: "Desktop Automation Engineer",
        requirements: ["React", "Rust", "Tauri"],
      },
      tailoringNotes: ["Emphasized local-first desktop automation"],
    });
  });

  it("writes a cover letter PDF artifact", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "careercaveman-cover-"));
    tempDirs.push(outputDir);

    const result = await renderCoverLetterPdf(
      {
        context,
        coverLetter: "Dear Northstar Labs team,\n\nI am excited to apply.",
      },
      { outputDir },
    );

    expect(result).toEqual({
      pdfPath: join(outputDir, "app-1", "cover-letter-v3.pdf"),
      fileName: "cover-letter-v3.pdf",
    });
    await expect(readFile(result.pdfPath, "utf8")).resolves.toSatisfy((value) => {
      expect(typeof value).toBe("string");
      const pdf = value as string;
      expect(pdf).toContain("%PDF-1.4");
      expect(pdf).toContain("Cover Letter");
      expect(pdf).toContain("Dear Northstar Labs team,");
      expect(pdf).toContain("I am excited to apply.");
      return true;
    });
  });
});
