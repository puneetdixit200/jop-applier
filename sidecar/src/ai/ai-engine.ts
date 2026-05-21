import type {
  AIProvider,
  ClassifiedJobPosting,
  ChatMessage,
  ChatOptions,
  CompanyForEmail,
  CompletionOptions,
  JobForContent,
  JobForMatching,
  MatchResult,
  ModelInfo,
  ProfileForContent,
  ProfileForMatching,
  ResumeContent,
  TailoredResume,
} from "./provider-interface.js";

export class AIEngine {
  private activeIndex = 0;

  constructor(private readonly providers: AIProvider[]) {
    if (providers.length === 0) {
      throw new Error("AIEngine requires at least one provider");
    }
  }

  activeProvider(): ModelInfo {
    return this.providers[this.activeIndex].getModelInfo();
  }

  switchProvider(providerName: string): void {
    const nextIndex = this.providers.findIndex((provider) => provider.getModelInfo().provider === providerName);
    if (nextIndex === -1) {
      throw new Error(`Unknown AI provider: ${providerName}`);
    }
    this.activeIndex = nextIndex;
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    const errors: string[] = [];

    for (let offset = 0; offset < this.providers.length; offset += 1) {
      const index = (this.activeIndex + offset) % this.providers.length;
      const provider = this.providers[index];
      const info = provider.getModelInfo();

      try {
        if (!(await provider.isAvailable())) {
          throw new Error(`${info.provider} unavailable`);
        }
        const response = await provider.complete(prompt, options);
        this.activeIndex = index;
        return response;
      } catch (error) {
        errors.push(`${info.provider}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    throw new Error(`All AI providers failed: ${errors.join("; ")}`);
  }

  async *chat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string> {
    const provider = this.providers[this.activeIndex];
    if (!(await provider.isAvailable())) {
      await this.complete(messages.map((message) => message.content).join("\n"), options);
    }

    yield* this.providers[this.activeIndex].chat(messages, options);
  }

  async matchJob(job: JobForMatching, profile: ProfileForMatching): Promise<MatchResult> {
    const prompt = [
      "Score this job for the candidate as strict JSON.",
      `Job title: ${job.title}`,
      `Job description: ${job.description}`,
      `Candidate headline: ${profile.headline}`,
      `Candidate skills: ${profile.skills.join(", ")}`,
      'Return {"score":number,"reasoning":string,"tags":string[]}.',
    ].join("\n");

    const raw = await this.complete(prompt, { temperature: 0.1 });
    const parsed = JSON.parse(raw) as Partial<MatchResult>;

    if (typeof parsed.score !== "number" || parsed.score < 0 || parsed.score > 100) {
      throw new Error("AI match result must include a score from 0 to 100");
    }
    if (typeof parsed.reasoning !== "string" || parsed.reasoning.length === 0) {
      throw new Error("AI match result must include reasoning");
    }
    if (!Array.isArray(parsed.tags) || parsed.tags.some((tag) => typeof tag !== "string")) {
      throw new Error("AI match result must include string tags");
    }

    return {
      score: parsed.score,
      reasoning: parsed.reasoning,
      tags: parsed.tags,
    };
  }

  async tailorResume(resume: ResumeContent, job: JobForContent): Promise<TailoredResume> {
    const prompt = [
      "Tailor this resume for the job as strict JSON.",
      "Preserve accurate facts, reorder and emphasize relevant experience, and do not invent credentials.",
      `Resume JSON: ${JSON.stringify(resume)}`,
      `Job JSON: ${JSON.stringify(job)}`,
      'Return a JSON object with "summary", "skills", and "tailoringNotes" plus any preserved resume sections.',
    ].join("\n");

    const raw = await this.complete(prompt, { temperature: 0.2 });
    const parsed = parseJsonObject(raw, "AI tailored resume result");
    const summary = requireString(parsed, "summary", "AI tailored resume result");
    const skills = requireStringArray(parsed, "skills", "AI tailored resume result");
    const tailoringNotes = requireStringArray(parsed, "tailoringNotes", "AI tailored resume result");

    return {
      ...parsed,
      summary,
      skills,
      tailoringNotes,
    };
  }

  async generateCoverLetter(profile: ProfileForContent, job: JobForContent): Promise<string> {
    const prompt = [
      "Generate a personalized cover letter for this application.",
      "Keep it professional, specific to the company and role, and grounded only in the candidate profile.",
      `Candidate JSON: ${JSON.stringify(profile)}`,
      `Job JSON: ${JSON.stringify(job)}`,
    ].join("\n");

    return nonEmptyCompletion(await this.complete(prompt, { temperature: 0.4 }), "AI cover letter result");
  }

  async generateColdEmail(profile: ProfileForContent, company: CompanyForEmail): Promise<string> {
    const prompt = [
      "Write a concise cold outreach email for this target company.",
      "Include a useful subject line, a short personalized opener, and a clear low-friction call to action.",
      `Candidate JSON: ${JSON.stringify(profile)}`,
      `Company JSON: ${JSON.stringify(company)}`,
    ].join("\n");

    return nonEmptyCompletion(await this.complete(prompt, { temperature: 0.4 }), "AI cold email result");
  }

  async classifyJobPosting(rawPosting: string): Promise<ClassifiedJobPosting> {
    const prompt = [
      "Extract structured job data from this posting as strict JSON.",
      `Posting: ${rawPosting}`,
      'Return {"title":string,"companyName":string,"location":string|null,"description":string,"requirements":string[],"jobType":string|null,"experienceLevel":string|null,"remote":boolean}.',
    ].join("\n");

    const raw = await this.complete(prompt, { temperature: 0.1 });
    const parsed = parseJsonObject(raw, "AI classified job result");

    return {
      title: requireString(parsed, "title", "AI classified job result"),
      companyName: requireString(parsed, "companyName", "AI classified job result"),
      location: optionalString(parsed, "location", "AI classified job result"),
      description: requireString(parsed, "description", "AI classified job result"),
      requirements: requireStringArray(parsed, "requirements", "AI classified job result"),
      jobType: optionalString(parsed, "jobType", "AI classified job result"),
      experienceLevel: optionalString(parsed, "experienceLevel", "AI classified job result"),
      remote: requireBoolean(parsed, "remote", "AI classified job result"),
    };
  }
}

function parseJsonObject(raw: string, context: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${context} must be valid JSON`);
  }

  if (!isRecord(parsed)) {
    throw new Error(`${context} must be a JSON object`);
  }

  return parsed;
}

function requireString(record: Record<string, unknown>, key: string, context: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${context} must include ${key}`);
  }
  return value;
}

function optionalString(record: Record<string, unknown>, key: string, context: string): string | null {
  const value = record[key];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`${context} must include ${key} as a string or null`);
  }
  return value;
}

function requireStringArray(record: Record<string, unknown>, key: string, context: string): string[] {
  const value = record[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${context} must include ${key} as a string array`);
  }
  return value;
}

function requireBoolean(record: Record<string, unknown>, key: string, context: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new Error(`${context} must include ${key} as a boolean`);
  }
  return value;
}

function nonEmptyCompletion(raw: string, context: string): string {
  const value = raw.trim();
  if (value.length === 0) {
    throw new Error(`${context} cannot be empty`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
