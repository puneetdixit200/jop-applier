import { describe, expect, it } from "vitest";
import type { ApplicationProcessingApplication } from "./application-worker.js";
import { createBrowserApplicationAutomation } from "./browser-application-automation.js";
import type { DetectedFormField } from "./form-filler.js";
import type { PlaywrightFormPageLike, PlaywrightLocatorLike } from "./playwright-form-page.js";

describe("browser application automation", () => {
  it("fills, submits, and verifies a full-auto application on the same browser page", async () => {
    const calls: string[] = [];
    const page = fakeApplicationPage(calls, "https://jobs.lever.co/northstar/42", [
      field("#name", "Full name", "input", true),
      field("#email", "Email address", "input", true),
      field("#resume", "Resume", "file", true),
      field("#interest", "Why do you want to work here?", "textarea", true),
    ]);
    const openedPlatforms: string[] = [];
    const application = queuedApplication({
      resumePath: "/tmp/app-1-resume.pdf",
      coverLetterPath: "/tmp/app-1-cover-letter.pdf",
    });
    const automation = createBrowserApplicationAutomation({
      browserManager: {
        openSession: async (platform) => {
          openedPlatforms.push(platform);

          return {
            newPage: async () => page,
          };
        },
      },
      loadApplicationContext: async () => ({
        applicationUrl: "https://jobs.lever.co/northstar/42",
        platform: "lever",
        jobTitle: "Frontend Engineer",
        profile: {
          fullName: "Deepak Kudi",
          email: "deepak@example.com",
          phone: "+91-555-0101",
          location: "Bengaluru, India",
        },
      }),
      answerQuestion: async (field) => {
        if (field.label === "Why do you want to work here?") {
          return "I want to work at Northstar Labs because the role matches my React experience.";
        }

        return null;
      },
    });

    const fillResult = await automation.fillApplicationForm(application);
    const submission = await automation.submitApplication(application);
    const verification = await automation.verifySubmission?.(application, submission);

    expect(fillResult).toEqual({
      platform: "lever",
      submissionUrl: "https://jobs.lever.co/northstar/42",
      mappedFields: 4,
      requiredMissing: [],
    });
    expect(submission).toEqual({
      confirmationId: "CONF-42",
      finalUrl: "https://jobs.lever.co/northstar/42/confirmation",
      receiptText: "Thanks for applying. Confirmation CONF-42",
    });
    expect(verification).toEqual({
      ok: true,
      confirmationId: "CONF-42",
      message: "submission confirmation detected",
    });
    expect(openedPlatforms).toEqual(["lever"]);
    expect(calls).toEqual([
      "goto:https://jobs.lever.co/northstar/42:domcontentloaded",
      "evaluate",
      "evaluate",
      "fill:#name:Deepak Kudi",
      "fill:#email:deepak@example.com",
      "setInputFiles:#resume:/tmp/app-1-resume.pdf",
      "fill:#interest:I want to work at Northstar Labs because the role matches my React experience.",
      "click:button[type=\"submit\"], input[type=\"submit\"]",
      "waitForLoadState:domcontentloaded",
      "textContent:body",
    ]);
  });
});

type ApplicationLocatorLike = PlaywrightLocatorLike & {
  click: () => Promise<void>;
};

type ApplicationPageLike = Omit<PlaywrightFormPageLike, "locator"> & {
  goto: (url: string, options?: { waitUntil?: string }) => Promise<void>;
  locator: (selector: string) => ApplicationLocatorLike;
  textContent: (selector: string) => Promise<string | null>;
  waitForLoadState: (state: "domcontentloaded" | "load" | "networkidle") => Promise<void>;
};

function fakeApplicationPage(
  calls: string[],
  url: string,
  fields: DetectedFormField[],
): ApplicationPageLike {
  let currentUrl = url;

  return {
    evaluate: async <Result>() => {
      calls.push("evaluate");
      return fields as Result;
    },
    goto: async (nextUrl, options) => {
      currentUrl = nextUrl;
      calls.push(`goto:${nextUrl}:${options?.waitUntil ?? "default"}`);
    },
    locator: (selector) => ({
      click: async () => {
        currentUrl = `${currentUrl}/confirmation`;
        calls.push(`click:${selector}`);
      },
      fill: async (value) => {
        calls.push(`fill:${selector}:${value}`);
      },
      selectOption: async (value) => {
        calls.push(`selectOption:${selector}:${value}`);
      },
      setChecked: async (checked) => {
        calls.push(`setChecked:${selector}:${checked}`);
      },
      setInputFiles: async (path) => {
        calls.push(`setInputFiles:${selector}:${path}`);
      },
    }),
    textContent: async (selector) => {
      calls.push(`textContent:${selector}`);
      return "Thanks for applying. Confirmation CONF-42";
    },
    url: () => currentUrl,
    waitForLoadState: async (state) => {
      calls.push(`waitForLoadState:${state}`);
    },
  };
}

function field(
  selector: string,
  label: string,
  fieldType: DetectedFormField["fieldType"],
  required = false,
): DetectedFormField {
  return { selector, label, fieldType, required };
}

function queuedApplication(
  overrides: Partial<ApplicationProcessingApplication> = {},
): ApplicationProcessingApplication {
  return {
    id: "app-1",
    jobId: "job-1",
    companyName: "Northstar Labs",
    status: "queued",
    mode: "full_auto",
    resumePath: null,
    coverLetterPath: null,
    retryCount: 0,
    maxRetries: 3,
    ...overrides,
  };
}
