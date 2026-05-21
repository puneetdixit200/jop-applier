import { describe, expect, it } from "vitest";
import { AIEngine } from "./ai-engine.js";
import type { AIProvider, ChatMessage, ModelInfo } from "./provider-interface.js";

class FakeProvider implements AIProvider {
  constructor(
    private readonly name: string,
    private readonly response: string,
    private readonly available = true,
  ) {}

  async *chat(_messages: ChatMessage[]) {
    yield this.response;
  }

  async complete() {
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
});

