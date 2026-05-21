import type { AIEngine } from "../ai/ai-engine.js";
import type {
  JobForContent,
  ResumeContent,
  TailoredResume,
} from "../ai/provider-interface.js";
import type {
  ApplicationProcessingApplication,
  ApplicationWorkerDependencies,
} from "../applications/application-worker.js";
import type { EventBus } from "../orchestrator/event-bus.js";
import type { CareerEventMap } from "../orchestrator/events.js";

export type ApplicationDocumentContext = {
  applicationId: string;
  jobId: string;
  companyName: string;
  resumeVersion: number;
  profile: ResumeContent;
  job: JobForContent;
};

export type ResumeRenderInput = {
  resume: TailoredResume;
  context: ApplicationDocumentContext;
};

export type ResumeRenderResult = {
  pdfPath: string;
  pdfFileName: string;
  jsonPath: string;
  jsonFileName: string;
};

export type CoverLetterRenderInput = {
  coverLetter: string;
  context: ApplicationDocumentContext;
};

export type CoverLetterRenderResult = {
  pdfPath: string;
  fileName: string;
};

export type DocumentSaveInput = {
  applicationId: string;
  type: "resume" | "resume_json" | "cover_letter";
  filePath: string;
  fileName: string;
  version: number;
  aiModelUsed: string | null;
};

export type SavedDocument = DocumentSaveInput & {
  id: string;
};

export type ApplicationDocumentGeneratorDependencies = {
  ai: Pick<AIEngine, "activeProvider" | "tailorResume" | "generateCoverLetter">;
  loadContext: (application: ApplicationProcessingApplication) => Promise<ApplicationDocumentContext>;
  renderResume: (input: ResumeRenderInput) => Promise<ResumeRenderResult>;
  renderCoverLetter: (input: CoverLetterRenderInput) => Promise<CoverLetterRenderResult>;
  saveDocument: (document: DocumentSaveInput) => Promise<SavedDocument>;
};

export type ApplicationDocumentGeneratorOptions = {
  now: Date;
  eventBus?: EventBus<CareerEventMap>;
};

export function createApplicationDocumentGenerators(
  dependencies: ApplicationDocumentGeneratorDependencies,
  options: ApplicationDocumentGeneratorOptions,
): Pick<ApplicationWorkerDependencies, "generateResume" | "generateCoverLetter"> {
  return {
    generateResume: async (application) => {
      const context = await dependencies.loadContext(application);
      const aiModelUsed = modelLabel(dependencies.ai);
      const resume = await dependencies.ai.tailorResume(context.profile, context.job);
      const rendered = await dependencies.renderResume({ resume, context });

      await saveAndEmitDocument(
        dependencies,
        options,
        {
          applicationId: context.applicationId,
          type: "resume",
          filePath: rendered.pdfPath,
          fileName: rendered.pdfFileName,
          version: context.resumeVersion,
          aiModelUsed,
        },
      );
      await saveAndEmitDocument(
        dependencies,
        options,
        {
          applicationId: context.applicationId,
          type: "resume_json",
          filePath: rendered.jsonPath,
          fileName: rendered.jsonFileName,
          version: context.resumeVersion,
          aiModelUsed,
        },
      );

      return { resumePath: rendered.pdfPath };
    },
    generateCoverLetter: async (application) => {
      const context = await dependencies.loadContext(application);
      const aiModelUsed = modelLabel(dependencies.ai);
      const coverLetter = await dependencies.ai.generateCoverLetter(context.profile, context.job);
      const rendered = await dependencies.renderCoverLetter({ coverLetter, context });

      await saveAndEmitDocument(
        dependencies,
        options,
        {
          applicationId: context.applicationId,
          type: "cover_letter",
          filePath: rendered.pdfPath,
          fileName: rendered.fileName,
          version: context.resumeVersion,
          aiModelUsed,
        },
      );

      return { coverLetterPath: rendered.pdfPath };
    },
  };
}

async function saveAndEmitDocument(
  dependencies: Pick<ApplicationDocumentGeneratorDependencies, "saveDocument">,
  options: ApplicationDocumentGeneratorOptions,
  document: DocumentSaveInput,
): Promise<SavedDocument> {
  const saved = await dependencies.saveDocument(document);
  options.eventBus?.emit("document.generated", {
    applicationId: saved.applicationId,
    documentId: saved.id,
    documentType: saved.type,
    filePath: saved.filePath,
    fileName: saved.fileName,
    version: saved.version,
    aiModelUsed: saved.aiModelUsed,
    generatedAt: options.now,
  });

  return saved;
}

function modelLabel(ai: Pick<AIEngine, "activeProvider">): string {
  const provider = ai.activeProvider();
  return `${provider.provider}:${provider.model}`;
}
