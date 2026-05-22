import { describe, expect, it } from "vitest";
import { GroqProvider } from "./groq-provider.js";

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response;
}

describe("GroqProvider", () => {
  it("creates chat completions through Groq's OpenAI-compatible endpoint", async () => {
    const requests: Array<{ url: string; headers: HeadersInit | undefined; body: unknown }> = [];
    const provider = new GroqProvider({
      apiKey: "groq-key",
      model: "llama-3.1-8b-instant",
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          headers: init?.headers,
          body: JSON.parse(String(init?.body)),
        });
        return jsonResponse({
          choices: [{ message: { content: "Groq response" } }],
        });
      },
    });

    await expect(provider.complete("Score this job", { temperature: 0.1, maxTokens: 128 })).resolves.toBe(
      "Groq response",
    );
    expect(requests).toEqual([
      {
        url: "https://api.groq.com/openai/v1/chat/completions",
        headers: {
          Authorization: "Bearer groq-key",
          "Content-Type": "application/json",
        },
        body: {
          model: "llama-3.1-8b-instant",
          messages: [{ role: "user", content: "Score this job" }],
          temperature: 0.1,
          max_tokens: 128,
        },
      },
    ]);
    expect(provider.getModelInfo()).toEqual({
      provider: "groq",
      model: "llama-3.1-8b-instant",
      local: false,
    });
  });
});
