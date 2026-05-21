import { describe, expect, it } from "vitest";
import {
  createPlaywrightFormPage,
  type PlaywrightFormPageLike,
} from "./playwright-form-page.js";
import type { DetectedFormField } from "./form-filler.js";

describe("playwright form page adapter", () => {
  it("adapts a Playwright page to the application form page interface", async () => {
    const calls: string[] = [];
    const discoveredFields: DetectedFormField[] = [
      {
        selector: "#name",
        label: "Full name",
        fieldType: "input",
        required: true,
      },
      {
        selector: "#resume",
        label: "Resume/CV",
        fieldType: "file",
        required: true,
      },
    ];
    const page = fakePlaywrightPage({
      calls,
      fields: discoveredFields,
      url: "https://jobs.lever.co/northstar/42",
    });

    const formPage = createPlaywrightFormPage(page);

    await expect(formPage.url()).resolves.toBe("https://jobs.lever.co/northstar/42");
    await expect(formPage.fields()).resolves.toEqual(discoveredFields);

    await formPage.fillText("#name", "Deepak Kudi");
    await formPage.selectOption("#location", "Remote");
    await formPage.setChecked("#authorized", true);
    await formPage.setFile("#resume", "/docs/resume.pdf");

    expect(calls).toEqual([
      "evaluate",
      "fill:#name:Deepak Kudi",
      "selectOption:#location:Remote",
      "setChecked:#authorized:true",
      "setInputFiles:#resume:/docs/resume.pdf",
    ]);
  });

  it("discovers visible form controls with stable selectors and labels", async () => {
    const page = fakePlaywrightPage({
      calls: [],
      fields: [
        {
          selector: "#first_name",
          label: "First Name",
          fieldType: "input",
          required: true,
        },
        {
          selector: 'textarea[name="cover_letter"]',
          label: "Cover Letter",
          fieldType: "textarea",
          required: false,
        },
        {
          selector: 'select[name="work_authorization"]',
          label: "Work authorization",
          fieldType: "select",
          required: true,
          options: ["Yes", "No"],
        },
      ],
      url: "https://boards.greenhouse.io/northstar/jobs/42",
    });

    const formPage = createPlaywrightFormPage(page);

    await expect(formPage.fields()).resolves.toEqual([
      {
        selector: "#first_name",
        label: "First Name",
        fieldType: "input",
        required: true,
      },
      {
        selector: 'textarea[name="cover_letter"]',
        label: "Cover Letter",
        fieldType: "textarea",
        required: false,
      },
      {
        selector: 'select[name="work_authorization"]',
        label: "Work authorization",
        fieldType: "select",
        required: true,
        options: ["Yes", "No"],
      },
    ]);
  });
});

function fakePlaywrightPage({
  calls,
  fields,
  url,
}: {
  calls: string[];
  fields: DetectedFormField[];
  url: string;
}): PlaywrightFormPageLike {
  return {
    evaluate: async <Result>() => {
      calls.push("evaluate");
      return fields as Result;
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
    url: () => url,
  };
}
