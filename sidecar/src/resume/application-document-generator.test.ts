import { describe, expect, it } from "vitest";
import { EventBus } from "../orchestrator/event-bus.js";
import type { CareerEventMap } from "../orchestrator/events.js";
import {
  createApplicationDocumentGenerators,
  type ApplicationDocumentGeneratorDependencies,
} from "./application-document-generator.js";

const application = {
  id: "app-1",
  jobId: "job-1",
  companyName: "Northstar Labs",
  status: "queued" as const,
  mode: "semi-auto",
  resumePath: null,
  coverLetterPath: null,
  retryCount: 0,
  maxRetries: 3,
};

const context = {
  applicationId: "app-1",
  jobId: "job-1",
  companyName: "Northstar Labs",
  resumeVersion: 3,
  profile: {
    fullName: "Asha Rao",
    headline: "React and Tauri engineer",
    summary: "Frontend engineer",
    skills: ["React", "TypeScript"],
  },
  job: {
    title: "Desktop Automation Engineer",
    companyName: "Northstar Labs",
    description: "Build Tauri and Rust automation.",
    requirements: ["React", "Rust", "Tauri"],
  },
};

describe("application document generators", () => {
  it("generates a tailored resume PDF and JSON artifact for an application", async () => {
    const calls: string[] = [];
    const savedDocuments: Parameters<ApplicationDocumentGeneratorDependencies["saveDocument"]>[0][] = [];
    const events: CareerEventMap["document.generated"][] = [];
    const eventBus = new EventBus<CareerEventMap>();
    eventBus.on("document.generated", (event) => events.push(event));

    const generators = createApplicationDocumentGenerators(
      {
        ai: {
          activeProvider: () => ({ provider: "ollama", model: "mistral:7b-instruct", local: true }),
          tailorResume: async (resume, job) => {
            calls.push(`tailor:${resume.fullName}:${job.companyName}`);
            return {
              summary: "React and Rust desktop engineer.",
              skills: ["React", "TypeScript", "Rust", "Tauri"],
              tailoringNotes: ["Emphasized local-first desktop automation"],
            };
          },
          generateCoverLetter: async () => {
            throw new Error("cover letter should not be generated");
          },
        },
        loadContext: async (receivedApplication) => {
          calls.push(`context:${receivedApplication.id}`);
          return context;
        },
        renderResume: async ({ resume, context: receivedContext }) => {
          calls.push(`render-resume:${resume.summary}:${receivedContext.applicationId}`);
          return {
            pdfPath: "/tmp/app-1/resume-v3.pdf",
            pdfFileName: "resume-v3.pdf",
            jsonPath: "/tmp/app-1/resume-v3.json",
            jsonFileName: "resume-v3.json",
          };
        },
        renderCoverLetter: async () => {
          throw new Error("cover letter should not be rendered");
        },
        saveDocument: async (document) => {
          savedDocuments.push(document);
          return {
            id: `doc-${savedDocuments.length}`,
            ...document,
          };
        },
      },
      {
        now: new Date("2026-06-01T09:00:00Z"),
        eventBus,
      },
    );

    await expect(generators.generateResume(application)).resolves.toEqual({
      resumePath: "/tmp/app-1/resume-v3.pdf",
    });
    expect(calls).toEqual([
      "context:app-1",
      "tailor:Asha Rao:Northstar Labs",
      "render-resume:React and Rust desktop engineer.:app-1",
    ]);
    expect(savedDocuments).toEqual([
      {
        applicationId: "app-1",
        type: "resume",
        filePath: "/tmp/app-1/resume-v3.pdf",
        fileName: "resume-v3.pdf",
        version: 3,
        aiModelUsed: "ollama:mistral:7b-instruct",
      },
      {
        applicationId: "app-1",
        type: "resume_json",
        filePath: "/tmp/app-1/resume-v3.json",
        fileName: "resume-v3.json",
        version: 3,
        aiModelUsed: "ollama:mistral:7b-instruct",
      },
    ]);
    expect(events).toEqual([
      {
        applicationId: "app-1",
        documentId: "doc-1",
        documentType: "resume",
        filePath: "/tmp/app-1/resume-v3.pdf",
        fileName: "resume-v3.pdf",
        version: 3,
        aiModelUsed: "ollama:mistral:7b-instruct",
        generatedAt: new Date("2026-06-01T09:00:00Z"),
      },
      {
        applicationId: "app-1",
        documentId: "doc-2",
        documentType: "resume_json",
        filePath: "/tmp/app-1/resume-v3.json",
        fileName: "resume-v3.json",
        version: 3,
        aiModelUsed: "ollama:mistral:7b-instruct",
        generatedAt: new Date("2026-06-01T09:00:00Z"),
      },
    ]);
  });

  it("generates a cover letter document for an application", async () => {
    const calls: string[] = [];
    const savedDocuments: Parameters<ApplicationDocumentGeneratorDependencies["saveDocument"]>[0][] = [];
    const events: CareerEventMap["document.generated"][] = [];
    const eventBus = new EventBus<CareerEventMap>();
    eventBus.on("document.generated", (event) => events.push(event));

    const generators = createApplicationDocumentGenerators(
      {
        ai: {
          activeProvider: () => ({ provider: "openai", model: "gpt-4.1-mini", local: false }),
          tailorResume: async () => {
            throw new Error("resume should not be tailored");
          },
          generateCoverLetter: async (profile, job) => {
            calls.push(`cover:${profile.fullName}:${job.title}`);
            return "Dear Northstar Labs team,\n\nI am excited to apply.";
          },
        },
        loadContext: async (receivedApplication) => {
          calls.push(`context:${receivedApplication.id}`);
          return context;
        },
        renderResume: async () => {
          throw new Error("resume should not be rendered");
        },
        renderCoverLetter: async ({ coverLetter, context: receivedContext }) => {
          calls.push(`render-cover:${coverLetter.length}:${receivedContext.applicationId}`);
          return {
            pdfPath: "/tmp/app-1/cover-letter-v3.pdf",
            fileName: "cover-letter-v3.pdf",
          };
        },
        saveDocument: async (document) => {
          savedDocuments.push(document);
          return {
            id: `doc-${savedDocuments.length}`,
            ...document,
          };
        },
      },
      {
        now: new Date("2026-06-01T09:05:00Z"),
        eventBus,
      },
    );

    await expect(generators.generateCoverLetter(application)).resolves.toEqual({
      coverLetterPath: "/tmp/app-1/cover-letter-v3.pdf",
    });
    expect(calls).toEqual([
      "context:app-1",
      "cover:Asha Rao:Desktop Automation Engineer",
      "render-cover:49:app-1",
    ]);
    expect(savedDocuments).toEqual([
      {
        applicationId: "app-1",
        type: "cover_letter",
        filePath: "/tmp/app-1/cover-letter-v3.pdf",
        fileName: "cover-letter-v3.pdf",
        version: 3,
        aiModelUsed: "openai:gpt-4.1-mini",
      },
    ]);
    expect(events).toEqual([
      {
        applicationId: "app-1",
        documentId: "doc-1",
        documentType: "cover_letter",
        filePath: "/tmp/app-1/cover-letter-v3.pdf",
        fileName: "cover-letter-v3.pdf",
        version: 3,
        aiModelUsed: "openai:gpt-4.1-mini",
        generatedAt: new Date("2026-06-01T09:05:00Z"),
      },
    ]);
  });
});
