import { describe, expect, it } from "vitest";
import type { ApplicationProcessingApplication } from "./application-worker.js";
import { createBrowserApplicationFormFiller } from "./browser-form-fill-runner.js";
import type { DetectedFormField } from "./form-filler.js";
import type { PlaywrightFormPageLike } from "./playwright-form-page.js";

describe("browser-backed application form filler", () => {
  it("opens the platform session, navigates to the application URL, and fills the page", async () => {
    const calls: string[] = [];
    const page = fakePage(calls, "https://jobs.lever.co/northstar/42", [
      field("#name", "Full name", "input", true),
      field("#email", "Email address", "input", true),
      field("#resume", "Resume", "file", true),
      field("#interest", "Why do you want to work here?", "textarea", true),
    ]);
    const sessionsOpened: string[] = [];
    const application = queuedApplication({
      resumePath: "/tmp/app-1-resume.pdf",
      coverLetterPath: "/tmp/app-1-cover-letter.pdf",
    });
    const fillApplicationForm = createBrowserApplicationFormFiller({
      browserManager: {
        openSession: async (platform) => {
          sessionsOpened.push(platform);

          return {
            newPage: async () => page,
          };
        },
      },
      loadApplicationContext: async (receivedApplication) => {
        expect(receivedApplication).toBe(application);

        return {
          applicationUrl: "https://jobs.lever.co/northstar/42",
          platform: "lever",
          jobTitle: "Frontend Engineer",
          profile: {
            fullName: "Deepak Kudi",
            email: "deepak@example.com",
            phone: "+91-555-0101",
            location: "Bengaluru, India",
          },
        };
      },
      answerQuestion: async (field) => {
        if (field.label === "Why do you want to work here?") {
          return "I want to work at Northstar Labs because the role matches my React experience.";
        }

        return null;
      },
    });

    const result = await fillApplicationForm(application);

    expect(result).toEqual({
      platform: "lever",
      submissionUrl: "https://jobs.lever.co/northstar/42",
      mappedFields: 4,
      requiredMissing: [],
    });
    expect(sessionsOpened).toEqual(["lever"]);
    expect(calls).toEqual([
      "goto:https://jobs.lever.co/northstar/42:domcontentloaded",
      "evaluate",
      "evaluate",
      "fill:#name:Deepak Kudi",
      "fill:#email:deepak@example.com",
      "setInputFiles:#resume:/tmp/app-1-resume.pdf",
      "fill:#interest:I want to work at Northstar Labs because the role matches my React experience.",
    ]);
  });

  it("stops before filling when a captcha challenge is detected", async () => {
    const calls: string[] = [];
    const page = {
      ...fakePage(calls, "https://jobs.example/apply", [
        field("#name", "Full name", "input", true),
      ]),
      textContent: async (selector: string) => {
        calls.push(`textContent:${selector}`);
        return "Please verify you are human";
      },
    };
    const fillApplicationForm = createBrowserApplicationFormFiller({
      browserManager: {
        openSession: async () => ({
          newPage: async () => page,
        }),
      },
      loadApplicationContext: async () => ({
        applicationUrl: "https://jobs.example/apply",
        platform: "generic",
        jobTitle: "Frontend Engineer",
        profile: {
          fullName: "Deepak Kudi",
          email: "deepak@example.com",
        },
      }),
    });

    await expect(fillApplicationForm(queuedApplication())).rejects.toThrow(
      "generic captcha challenge detected",
    );
    expect(calls).toEqual([
      "goto:https://jobs.example/apply:domcontentloaded",
      "textContent:body",
    ]);
  });
});

type NavigablePlaywrightFormPage = PlaywrightFormPageLike & {
  goto: (url: string, options?: { waitUntil?: string }) => Promise<void>;
};

function fakePage(
  calls: string[],
  url: string,
  fields: DetectedFormField[],
): NavigablePlaywrightFormPage {
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
    url: () => currentUrl,
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
    mode: "semi_auto",
    resumePath: null,
    coverLetterPath: null,
    retryCount: 0,
    maxRetries: 3,
    ...overrides,
  };
}
