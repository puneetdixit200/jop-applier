import type {
  ApplicationProcessingApplication,
  ApplicationWorkerDependencies,
} from "./application-worker.js";
import {
  fillApplicationFormWithStrategy,
  type ApplicationFormInput,
  type ApplicationQuestionAnswerer,
  type FormFillerStrategy,
} from "./form-filler.js";
import { createPlaywrightFormPage, type PlaywrightFormPageLike } from "./playwright-form-page.js";

export type BrowserFormFillPage = PlaywrightFormPageLike & {
  goto: (
    url: string,
    options?: { waitUntil?: "commit" | "domcontentloaded" | "load" | "networkidle" },
  ) => Promise<unknown>;
};

export type BrowserFormFillSession = {
  newPage: () => Promise<BrowserFormFillPage>;
};

export type BrowserFormFillApplicationContext = {
  applicationUrl: string;
  platform: string;
  jobTitle: string;
  profile: ApplicationFormInput["profile"];
  answers?: Record<string, string>;
};

export type BrowserApplicationFormFillerDependencies = {
  browserManager: {
    openSession: (platform: string) => Promise<BrowserFormFillSession>;
  };
  loadApplicationContext: (
    application: ApplicationProcessingApplication,
  ) => Promise<BrowserFormFillApplicationContext>;
  strategies?: FormFillerStrategy[];
  answerQuestion?: ApplicationQuestionAnswerer;
};

export function createBrowserApplicationFormFiller({
  browserManager,
  loadApplicationContext,
  strategies,
  answerQuestion,
}: BrowserApplicationFormFillerDependencies): ApplicationWorkerDependencies["fillApplicationForm"] {
  return async (application) => {
    const context = await loadApplicationContext(application);
    const session = await browserManager.openSession(context.platform);
    const page = await session.newPage();

    await page.goto(context.applicationUrl, { waitUntil: "domcontentloaded" });

    return fillApplicationFormWithStrategy(
      createPlaywrightFormPage(page),
      applicationFormInput(application, context),
      { strategies, answerQuestion },
    );
  };
}

function applicationFormInput(
  application: ApplicationProcessingApplication,
  context: BrowserFormFillApplicationContext,
): ApplicationFormInput {
  return {
    companyName: application.companyName,
    jobTitle: context.jobTitle,
    profile: context.profile,
    documents: {
      resumePath: application.resumePath,
      coverLetterPath: application.coverLetterPath,
    },
    answers: context.answers,
  };
}
