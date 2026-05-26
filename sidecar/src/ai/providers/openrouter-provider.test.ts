import { describe, expect, it } from "vitest";
import { OpenRouterProvider } from "./openrouter-provider.js";

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response;
}

describe("OpenRouterProvider", () => {
  it("sends chat completions with bearer auth and model metadata", async () => {
    const requests: Array<{ url: string; headers: HeadersInit | undefined; body: unknown }> = [];
    const provider = new OpenRouterProvider({
      apiKey: "test-key",
      model: "openai/gpt-4o-mini",
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          headers: init?.headers,
          body: JSON.parse(String(init?.body)),
        });
        return jsonResponse({
          choices: [{ message: { content: "tailored answer" } }],
        });
      },
    });

    await expect(provider.complete("write a cover letter", { temperature: 0.3, maxTokens: 600 })).resolves.toBe(
      "tailored answer",
    );
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(requests[0].headers).toMatchObject({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/puneetdixit200/jop-applier",
      "X-Title": "job-hunt",
    });
    expect(requests[0].body).toEqual({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "write a cover letter" }],
      temperature: 0.3,
      max_tokens: 600,
    });
  });

  it("is unavailable without an API key", async () => {
    const provider = new OpenRouterProvider({
      apiKey: "",
      model: "openai/gpt-4o-mini",
      fetch: async () => jsonResponse({}),
    });

    await expect(provider.isAvailable()).resolves.toBe(false);
  });
});

