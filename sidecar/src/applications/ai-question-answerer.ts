import type { CompletionOptions } from "../ai/provider-interface.js";
import type {
  ApplicationFormInput,
  ApplicationQuestionAnswerer,
  DetectedFormField,
} from "./form-filler.js";

export type AIQuestionAnswererDependencies = {
  ai: {
    complete: (prompt: string, options?: CompletionOptions) => Promise<string>;
  };
  maxTokens?: number;
  temperature?: number;
};

export function createAIApplicationQuestionAnswerer({
  ai,
  maxTokens = 180,
  temperature = 0.2,
}: AIQuestionAnswererDependencies): ApplicationQuestionAnswerer {
  return async (field, input) => {
    const raw = await ai.complete(applicationQuestionPrompt(field, input), {
      temperature,
      maxTokens,
    });

    return parseAIQuestionAnswer(raw);
  };
}

function applicationQuestionPrompt(
  field: DetectedFormField,
  input: ApplicationFormInput,
): string {
  return [
    "Answer this job application form question.",
    "Use only the candidate profile, stored answers, and job context below.",
    "Do not invent credentials, legal status, salary, dates, or experience.",
    'Return strict JSON: {"answer": string | boolean | null}.',
    "Use null when the available context is not enough to answer accurately.",
    "For select fields, choose one option exactly when options are provided.",
    `Question JSON: ${JSON.stringify(questionContext(field))}`,
    `Application JSON: ${JSON.stringify(applicationContext(input))}`,
  ].join("\n");
}

function questionContext(field: DetectedFormField) {
  return {
    label: field.label,
    fieldType: field.fieldType,
    required: field.required === true,
    options: field.options ?? [],
  };
}

function applicationContext(input: ApplicationFormInput) {
  return {
    companyName: input.companyName,
    jobTitle: input.jobTitle,
    profile: input.profile,
    storedAnswers: input.answers ?? {},
  };
}

function parseAIQuestionAnswer(raw: string): string | boolean | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI application question answer must be strict JSON");
  }

  if (!isRecord(parsed) || !("answer" in parsed)) {
    throw new Error("AI application question answer must include answer");
  }

  const answer = parsed.answer;
  if (answer === null) {
    return null;
  }
  if (typeof answer === "boolean") {
    return answer;
  }
  if (typeof answer === "string") {
    const trimmed = answer.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  throw new Error("AI application question answer must be a string, boolean, or null");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
