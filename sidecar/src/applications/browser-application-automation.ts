import type {
  ApplicationProcessingApplication,
  ApplicationSubmissionResult,
  ApplicationSubmissionVerification,
  ApplicationWorkerDependencies,
} from "./application-worker.js";
import type {
  BrowserFormFillApplicationContext,
  BrowserFormFillPage,
} from "./browser-form-fill-runner.js";
import {
  fillApplicationFormWithStrategy,
  type ApplicationFormInput,
  type ApplicationQuestionAnswerer,
  type FormFillerStrategy,
} from "./form-filler.js";
import { createPlaywrightFormPage } from "./playwright-form-page.js";

const SUBMIT_SELECTOR = 'button[type="submit"], input[type="submit"]';

type BrowserApplicationLocator = ReturnType<BrowserFormFillPage["locator"]> & {
  click: () => Promise<void>;
};

type BrowserApplicationPage = Omit<BrowserFormFillPage, "locator"> & {
  locator: (selector: string) => BrowserApplicationLocator;
  textContent?: (selector: string) => Promise<string | null>;
  waitForLoadState?: (state: "domcontentloaded" | "load" | "networkidle") => Promise<void>;
};

type BrowserApplicationSession = {
  newPage: () => Promise<BrowserApplicationPage>;
};

export type BrowserApplicationAutomationDependencies = {
  browserManager: {
    openSession: (platform: string) => Promise<BrowserApplicationSession>;
  };
  loadApplicationContext: (
    application: ApplicationProcessingApplication,
  ) => Promise<BrowserFormFillApplicationContext>;
  strategies?: FormFillerStrategy[];
  answerQuestion?: ApplicationQuestionAnswerer;
};

export function createBrowserApplicationAutomation({
  browserManager,
  loadApplicationContext,
  strategies,
  answerQuestion,
}: BrowserApplicationAutomationDependencies): Pick<
  ApplicationWorkerDependencies,
  "fillApplicationForm" | "submitApplication" | "verifySubmission"
> {
  const pages = new Map<string, BrowserApplicationPage>();

  return {
    fillApplicationForm: async (application) => {
      const context = await loadApplicationContext(application);
      const session = await browserManager.openSession(context.platform);
      const page = await session.newPage();

      await page.goto(context.applicationUrl, { waitUntil: "domcontentloaded" });
      pages.set(application.id, page);

      return fillApplicationFormWithStrategy(
        createPlaywrightFormPage(page),
        applicationFormInput(application, context),
        { strategies, answerQuestion },
      );
    },
    submitApplication: async (application) => {
      const page = pages.get(application.id);
      if (!page) {
        throw new Error(`No prepared browser page found for application ${application.id}`);
      }

      await page.locator(SUBMIT_SELECTOR).click();
      await page.waitForLoadState?.("domcontentloaded");

      const receiptText = (await page.textContent?.("body")) ?? null;
      const confirmationId = extractConfirmationId(receiptText);
      pages.delete(application.id);

      return {
        confirmationId,
        finalUrl: page.url(),
        receiptText,
      };
    },
    verifySubmission: async (_application, submission) => verifyBrowserSubmission(submission),
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

function verifyBrowserSubmission(
  submission: ApplicationSubmissionResult,
): ApplicationSubmissionVerification {
  const confirmationId = submission.confirmationId ?? extractConfirmationId(submission.receiptText);
  if (confirmationId || hasSuccessMarker(submission.receiptText) || hasSuccessMarker(submission.finalUrl)) {
    return {
      ok: true,
      confirmationId,
      message: "submission confirmation detected",
    };
  }

  return {
    ok: false,
    confirmationId: null,
    message: "submission success marker not found",
  };
}

function extractConfirmationId(text: string | null | undefined): string | null {
  if (!text) {
    return null;
  }

  const match = text.match(
    /\b(?:confirmation|reference|application)\s*(?:id|number|#|:)?\s*([A-Z0-9][A-Z0-9-]{3,})/i,
  );

  return match?.[1] ?? null;
}

function hasSuccessMarker(value: string | null | undefined): boolean {
  return Boolean(
    value?.match(
      /\b(thank you|thanks for applying|application received|application submitted|successfully submitted|confirmation)\b/i,
    ),
  );
}
