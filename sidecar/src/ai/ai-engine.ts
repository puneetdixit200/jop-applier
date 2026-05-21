import type {
  AIProvider,
  ChatMessage,
  ChatOptions,
  CompletionOptions,
  JobForMatching,
  MatchResult,
  ModelInfo,
  ProfileForMatching,
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
}

