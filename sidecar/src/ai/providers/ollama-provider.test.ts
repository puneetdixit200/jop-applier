import { describe, expect, it } from "vitest";
import { OllamaProvider } from "./ollama-provider.js";

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response;
}

describe("OllamaProvider", () => {
  it("checks local model availability through the tags endpoint", async () => {
    const calls: string[] = [];
    const provider = new OllamaProvider({
      baseUrl: "http://localhost:11434",
      model: "mistral:7b-instruct",
      fetch: async (url) => {
        calls.push(String(url));
        return jsonResponse({ models: [{ name: "mistral:7b-instruct" }] });
      },
    });

    await expect(provider.isAvailable()).resolves.toBe(true);
    expect(calls).toEqual(["http://localhost:11434/api/tags"]);
  });

  it("sends non-streaming completion requests to Ollama", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const provider = new OllamaProvider({
      baseUrl: "http://localhost:11434",
      model: "llama3.1:8b",
      fetch: async (url, init) => {
        requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        return jsonResponse({ response: "match score: 84" });
      },
    });

    await expect(provider.complete("score this job", { temperature: 0.2 })).resolves.toBe("match score: 84");
    expect(requests).toEqual([
      {
        url: "http://localhost:11434/api/generate",
        body: {
          model: "llama3.1:8b",
          prompt: "score this job",
          stream: false,
          options: {
            temperature: 0.2,
          },
        },
      },
    ]);
  });
});

