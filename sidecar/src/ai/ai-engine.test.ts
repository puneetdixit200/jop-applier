import { describe, expect, it } from "vitest";
import { AIEngine } from "./ai-engine.js";
import type { AIProvider, ChatMessage, CompletionOptions, ModelInfo } from "./provider-interface.js";

class FakeProvider implements AIProvider {
  readonly prompts: string[] = [];
  readonly completionOptions: Array<CompletionOptions | undefined> = [];

  constructor(
    private readonly name: string,
    private readonly response: string,
    private readonly available = true,
  ) {}

  async *chat(_messages: ChatMessage[]) {
    yield this.response;
  }

  async complete(prompt: string, options?: CompletionOptions) {
    this.prompts.push(prompt);
    this.completionOptions.push(options);
    if (!this.available) {
      throw new Error(`${this.name} unavailable`);
    }
    return this.response;
  }

  async embed() {
    return [1, 2, 3];
  }

  async isAvailable() {
    return this.available;
  }

  getModelInfo(): ModelInfo {
    return {
      provider: this.name,
      model: "test-model",
      local: this.name === "ollama",
    };
  }
}

describe("AIEngine", () => {
  it("falls back to the next configured provider when completion fails", async () => {
    const engine = new AIEngine([
      new FakeProvider("ollama", "local", false),
      new FakeProvider("openrouter", "cloud", true),
    ]);

    await expect(engine.complete("score this job")).resolves.toBe("cloud");
    expect(engine.activeProvider().provider).toBe("openrouter");
  });

  it("scores a job from provider JSON output", async () => {
    const engine = new AIEngine([
      new FakeProvider("ollama", '{"score":86,"reasoning":"Strong React and Rust match","tags":["react","rust"]}', true),
    ]);

    await expect(
      engine.matchJob(
        { title: "Frontend Engineer", description: "React and Rust desktop work" },
        { headline: "React TypeScript engineer", skills: ["React", "TypeScript", "Rust"] },
      ),
    ).resolves.toEqual({
      score: 86,
      reasoning: "Strong React and Rust match",
      tags: ["react", "rust"],
    });
  });

  it("tailors a resume from provider JSON output", async () => {
    const provider = new FakeProvider(
      "ollama",
      JSON.stringify({
        summary: "React and Rust desktop engineer focused on local-first tools.",
        skills: ["React", "TypeScript", "Rust", "Tauri"],
        experience: [
          {
            company: "Orbit Apps",
            title: "Frontend Engineer",
            highlights: ["Built a Tauri workflow dashboard"],
          },
        ],
        tailoringNotes: ["Emphasized desktop automation experience"],
      }),
      true,
    );
    const engine = new AIEngine([provider]);

    await expect(
      engine.tailorResume(
        {
          fullName: "Asha Rao",
          summary: "Frontend engineer",
          skills: ["React", "TypeScript"],
        },
        {
          title: "Desktop Automation Engineer",
          companyName: "Northstar Labs",
          description: "Build Tauri and Rust workflow automation.",
        },
      ),
    ).resolves.toEqual({
      summary: "React and Rust desktop engineer focused on local-first tools.",
      skills: ["React", "TypeScript", "Rust", "Tauri"],
      experience: [
        {
          company: "Orbit Apps",
          title: "Frontend Engineer",
          highlights: ["Built a Tauri workflow dashboard"],
        },
      ],
      tailoringNotes: ["Emphasized desktop automation experience"],
    });
    expect(provider.prompts[0]).toContain("Tailor this resume");
    expect(provider.prompts[0]).toContain("Northstar Labs");
    expect(provider.completionOptions[0]).toEqual({ temperature: 0.2 });
  });

  it("generates a cover letter with candidate and job context", async () => {
    const provider = new FakeProvider(
      "ollama",
      "Dear Northstar Labs team,\n\nI am excited to apply for the Desktop Automation Engineer role.",
      true,
    );
    const engine = new AIEngine([provider]);

    await expect(
      engine.generateCoverLetter(
        {
          fullName: "Asha Rao",
          headline: "React and Tauri engineer",
          skills: ["React", "Rust", "Tauri"],
        },
        {
          title: "Desktop Automation Engineer",
          companyName: "Northstar Labs",
          description: "Build local-first job automation.",
        },
      ),
    ).resolves.toBe(
      "Dear Northstar Labs team,\n\nI am excited to apply for the Desktop Automation Engineer role.",
    );
    expect(provider.prompts[0]).toContain("Generate a personalized cover letter");
    expect(provider.prompts[0]).toContain("Asha Rao");
    expect(provider.prompts[0]).toContain("Desktop Automation Engineer");
    expect(provider.completionOptions[0]).toEqual({ temperature: 0.4 });
  });

  it("generates a cold email for a target company", async () => {
    const provider = new FakeProvider(
      "ollama",
      "Subject: React automation engineer interested in Northstar Labs\n\nHi Mira,",
      true,
    );
    const engine = new AIEngine([provider]);

    await expect(
      engine.generateColdEmail(
        {
          fullName: "Asha Rao",
          headline: "React and Tauri engineer",
          skills: ["React", "Rust", "Tauri"],
        },
        {
          name: "Northstar Labs",
          contactName: "Mira",
          industry: "developer tools",
          context: "Hiring desktop automation engineers",
        },
      ),
    ).resolves.toBe("Subject: React automation engineer interested in Northstar Labs\n\nHi Mira,");
    expect(provider.prompts[0]).toContain("Write a concise cold outreach email");
    expect(provider.prompts[0]).toContain("Northstar Labs");
    expect(provider.prompts[0]).toContain("Mira");
    expect(provider.completionOptions[0]).toEqual({ temperature: 0.4 });
  });

  it("classifies raw job posting text into structured job data", async () => {
    const provider = new FakeProvider(
      "ollama",
      JSON.stringify({
        title: "Frontend Engineer Intern",
        companyName: "Northstar Labs",
        location: "Remote",
        description: "Build React workflow tools.",
        requirements: ["React", "TypeScript"],
        jobType: "internship",
        experienceLevel: "entry",
        remote: true,
      }),
      true,
    );
    const engine = new AIEngine([provider]);

    await expect(engine.classifyJobPosting("<main>Frontend Engineer Intern at Northstar Labs</main>")).resolves.toEqual({
      title: "Frontend Engineer Intern",
      companyName: "Northstar Labs",
      location: "Remote",
      description: "Build React workflow tools.",
      requirements: ["React", "TypeScript"],
      jobType: "internship",
      experienceLevel: "entry",
      remote: true,
    });
    expect(provider.prompts[0]).toContain("Extract structured job data");
    expect(provider.prompts[0]).toContain("Frontend Engineer Intern");
    expect(provider.completionOptions[0]).toEqual({ temperature: 0.1 });
  });
});
