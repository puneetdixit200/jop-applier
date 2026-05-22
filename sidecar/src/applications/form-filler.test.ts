import { describe, expect, it } from "vitest";
import {
  createDefaultFormFillerStrategies,
  fillApplicationFormWithStrategy,
  type ApplicationFormInput,
  type ApplicationFormPage,
  type DetectedFormField,
  type FormFieldMapping,
} from "./form-filler.js";

describe("application form filler strategies", () => {
  it("selects a platform strategy and maps common ATS fields from the profile and documents", async () => {
    const strategies = createDefaultFormFillerStrategies();
    const page = formPage("https://boards.greenhouse.io/northstar/jobs/42", [
      field("#first-name", "First Name"),
      field("#last-name", "Last Name"),
      field("#email", "Email"),
      field("#phone", "Phone"),
      field("#location", "Current Location"),
      field("#resume", "Resume/CV", "file"),
      field("#cover-letter", "Cover Letter", "file"),
    ]);

    let strategy = strategies[0];
    for (const candidate of strategies) {
      if (await candidate.detect(page, applicationForm())) {
        strategy = candidate;
        break;
      }
    }
    const mappings = await strategy?.mapFields(page, applicationForm());

    expect(strategy?.platform).toBe("greenhouse");
    expect(mappings).toEqual([
      mapping("#first-name", "First Name", "input", "Deepak"),
      mapping("#last-name", "Last Name", "input", "Kudi"),
      mapping("#email", "Email", "input", "deepak@example.com"),
      mapping("#phone", "Phone", "input", "+91-555-0101"),
      mapping("#location", "Current Location", "input", "Bengaluru, India"),
      mapping("#resume", "Resume/CV", "file", "/docs/deepak-resume.pdf"),
      mapping("#cover-letter", "Cover Letter", "file", "/docs/deepak-cover-letter.pdf"),
    ]);
  });

  it("fills mapped fields through a browser page adapter and reports missing required fields", async () => {
    const filledText: Array<{ selector: string; value: string }> = [];
    const uploadedFiles: Array<{ selector: string; path: string }> = [];
    const page = formPage(
      "https://jobs.lever.co/northstar/42",
      [
        field("#name", "Full name", "input", true),
        field("#email", "Email address", "input", true),
        field("#resume", "Resume", "file", true),
        field("#portfolio", "Portfolio URL", "input", true),
      ],
      {
        fillText: async (selector, value) => {
          filledText.push({ selector, value });
        },
        setFile: async (selector, path) => {
          uploadedFiles.push({ selector, path });
        },
      },
    );

    const result = await fillApplicationFormWithStrategy(page, applicationForm());

    expect(result).toEqual({
      platform: "lever",
      submissionUrl: "https://jobs.lever.co/northstar/42",
      mappedFields: 3,
      requiredMissing: ["Portfolio URL"],
    });
    expect(filledText).toEqual([
      { selector: "#name", value: "Deepak Kudi" },
      { selector: "#email", value: "deepak@example.com" },
    ]);
    expect(uploadedFiles).toEqual([{ selector: "#resume", path: "/docs/deepak-resume.pdf" }]);
  });

  it("selects Workday, BambooHR, and iCIMS strategies before generic fallback", async () => {
    const strategies = createDefaultFormFillerStrategies();

    await expect(selectedPlatform(strategies, "https://northstar.wd1.myworkdayjobs.com/job/1"))
      .resolves.toBe("workday");
    await expect(selectedPlatform(strategies, "https://northstar.bamboohr.com/careers/404"))
      .resolves.toBe("bamboohr");
    await expect(selectedPlatform(strategies, "https://northstar.icims.com/jobs/501/role/job"))
      .resolves.toBe("icims");
  });

  it("selects LinkedIn Easy Apply and fills custom screening questions from natural labels", async () => {
    const filledText: Array<{ selector: string; value: string }> = [];
    const selectedOptions: Array<{ selector: string; value: string }> = [];
    const checkedFields: Array<{ selector: string; checked: boolean }> = [];
    const uploadedFiles: Array<{ selector: string; path: string }> = [];
    const page = formPage(
      "https://www.linkedin.com/jobs/view/1234567890",
      [
        field("#phone", "Mobile phone number", "input", true),
        field("#resume", "Resume", "file", true),
        field("#authorized", "Are you legally authorized to work in India?", "select", true),
        field("#relocate", "Willing to relocate?", "checkbox", true),
        field(
          "#sponsorship",
          "Do you now or in the future require sponsorship?",
          "select",
          true,
        ),
      ],
      {
        fillText: async (selector, value) => {
          filledText.push({ selector, value });
        },
        selectOption: async (selector, value) => {
          selectedOptions.push({ selector, value });
        },
        setChecked: async (selector, checked) => {
          checkedFields.push({ selector, checked });
        },
        setFile: async (selector, path) => {
          uploadedFiles.push({ selector, path });
        },
      },
    );

    const result = await fillApplicationFormWithStrategy(
      page,
      applicationForm({
        answers: {
          "Are you legally authorized to work in India?": "Yes",
          "Willing to relocate?": "true",
          "Do you now or in the future require sponsorship?": "No",
        },
      }),
    );

    expect(result).toEqual({
      platform: "linkedin",
      submissionUrl: "https://www.linkedin.com/jobs/view/1234567890",
      mappedFields: 5,
      requiredMissing: [],
    });
    expect(filledText).toEqual([{ selector: "#phone", value: "+91-555-0101" }]);
    expect(uploadedFiles).toEqual([{ selector: "#resume", path: "/docs/deepak-resume.pdf" }]);
    expect(selectedOptions).toEqual([
      { selector: "#authorized", value: "Yes" },
      { selector: "#sponsorship", value: "No" },
    ]);
    expect(checkedFields).toEqual([{ selector: "#relocate", checked: true }]);
  });

  it("answers required custom questions that were not mapped from stored answers", async () => {
    const filledText: Array<{ selector: string; value: string }> = [];
    const selectedOptions: Array<{ selector: string; value: string }> = [];
    const answeredQuestions: string[] = [];
    const page = formPage(
      "https://boards.greenhouse.io/northstar/jobs/42",
      [
        field("#name", "Full name", "input", true),
        field("#email", "Email address", "input", true),
        field("#interest", "Why do you want to work here?", "textarea", true),
        field("#authorized", "Are you legally authorized to work in India?", "select", true),
      ],
      {
        fillText: async (selector, value) => {
          filledText.push({ selector, value });
        },
        selectOption: async (selector, value) => {
          selectedOptions.push({ selector, value });
        },
      },
    );

    const result = await fillApplicationFormWithStrategy(page, applicationForm(), {
      answerQuestion: async (field, input) => {
        answeredQuestions.push(`${field.label}:${input.companyName}`);
        if (field.label === "Why do you want to work here?") {
          return "I am interested in Northstar Labs because the role matches my React experience.";
        }
        if (field.label === "Are you legally authorized to work in India?") {
          return "Yes";
        }

        return null;
      },
    });

    expect(result).toEqual({
      platform: "greenhouse",
      submissionUrl: "https://boards.greenhouse.io/northstar/jobs/42",
      mappedFields: 4,
      requiredMissing: [],
    });
    expect(answeredQuestions).toEqual([
      "Why do you want to work here?:Northstar Labs",
      "Are you legally authorized to work in India?:Northstar Labs",
    ]);
    expect(filledText).toEqual([
      { selector: "#name", value: "Deepak Kudi" },
      { selector: "#email", value: "deepak@example.com" },
      {
        selector: "#interest",
        value: "I am interested in Northstar Labs because the role matches my React experience.",
      },
    ]);
    expect(selectedOptions).toEqual([{ selector: "#authorized", value: "Yes" }]);
  });
});

async function selectedPlatform(
  strategies: ReturnType<typeof createDefaultFormFillerStrategies>,
  url: string,
): Promise<string> {
  const page = formPage(url, []);
  for (const strategy of strategies) {
    if (await strategy.detect(page, applicationForm())) {
      return strategy.platform;
    }
  }

  throw new Error("No strategy selected");
}

function applicationForm(overrides: Partial<ApplicationFormInput> = {}): ApplicationFormInput {
  return {
    companyName: "Northstar Labs",
    jobTitle: "Frontend Engineer",
    profile: {
      fullName: "Deepak Kudi",
      email: "deepak@example.com",
      phone: "+91-555-0101",
      location: "Bengaluru, India",
    },
    documents: {
      resumePath: "/docs/deepak-resume.pdf",
      coverLetterPath: "/docs/deepak-cover-letter.pdf",
    },
    ...overrides,
  };
}

function field(
  selector: string,
  label: string,
  fieldType: DetectedFormField["fieldType"] = "input",
  required = false,
): DetectedFormField {
  return { selector, label, fieldType, required };
}

function mapping(
  selector: string,
  fieldLabel: string,
  fieldType: FormFieldMapping["fieldType"],
  value: string,
): FormFieldMapping {
  return {
    selector,
    fieldLabel,
    fieldType,
    value,
    confidence: 0.95,
  };
}

function formPage(
  url: string,
  fields: DetectedFormField[],
  overrides: Partial<ApplicationFormPage> = {},
): ApplicationFormPage {
  return {
    fields: async () => fields,
    fillText: async () => undefined,
    selectOption: async () => undefined,
    setChecked: async () => undefined,
    setFile: async () => undefined,
    url: async () => url,
    ...overrides,
  };
}
