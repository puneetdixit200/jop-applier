import { describe, expect, it } from "vitest";
import { createAIApplicationQuestionAnswerer } from "./ai-question-answerer.js";
import type { ApplicationFormInput, DetectedFormField } from "./form-filler.js";

describe("AI application question answerer", () => {
  it("asks AI for a grounded strict-JSON answer to a custom application question", async () => {
    const completions: Array<{ prompt: string; options: { temperature?: number; maxTokens?: number } | undefined }> = [];
    const answerer = createAIApplicationQuestionAnswerer({
      ai: {
        complete: async (prompt, options) => {
          completions.push({ prompt, options });
          return JSON.stringify({ answer: "Yes" });
        },
      },
    });

    const answer = await answerer(
      field("#authorized", "Are you legally authorized to work in India?", "select", ["Yes", "No"]),
      applicationForm(),
    );

    expect(answer).toBe("Yes");
    expect(completions).toHaveLength(1);
    expect(completions[0]?.options).toEqual({ temperature: 0.2, maxTokens: 180 });
    expect(completions[0]?.prompt).toContain("Return strict JSON");
    expect(completions[0]?.prompt).toContain("Do not invent credentials");
    expect(completions[0]?.prompt).toContain('"fieldType":"select"');
    expect(completions[0]?.prompt).toContain('"options":["Yes","No"]');
    expect(completions[0]?.prompt).toContain('"companyName":"Northstar Labs"');
    expect(completions[0]?.prompt).toContain('"jobTitle":"Frontend Engineer"');
    expect(completions[0]?.prompt).toContain('"location":"Bengaluru, India"');
  });

  it("returns null when AI says there is not enough grounded information", async () => {
    const answerer = createAIApplicationQuestionAnswerer({
      ai: {
        complete: async () => JSON.stringify({ answer: null }),
      },
    });

    await expect(
      answerer(field("#salary", "What are your salary expectations?", "input"), applicationForm()),
    ).resolves.toBeNull();
  });

  it("rejects malformed AI answers instead of filling unknown form values", async () => {
    const answerer = createAIApplicationQuestionAnswerer({
      ai: {
        complete: async () => "Definitely yes",
      },
    });

    await expect(
      answerer(field("#authorized", "Are you legally authorized?", "select"), applicationForm()),
    ).rejects.toThrow("AI application question answer must be strict JSON");
  });
});

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
    answers: {
      "Do you require sponsorship?": "No",
    },
    ...overrides,
  };
}

function field(
  selector: string,
  label: string,
  fieldType: DetectedFormField["fieldType"],
  options?: string[],
): DetectedFormField {
  return {
    selector,
    label,
    fieldType,
    required: true,
    ...(options ? { options } : {}),
  };
}
