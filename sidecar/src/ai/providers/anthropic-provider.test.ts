import { describe, expect, it } from "vitest";
import { AnthropicProvider } from "./anthropic-provider.js";

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response;
}

describe("AnthropicProvider", () => {
  it("creates message completions through the Anthropic messages endpoint", async () => {
    const requests: Array<{ url: string; headers: HeadersInit | undefined; body: unknown }> = [];
    const provider = new AnthropicProvider({
      apiKey: "anthropic-key",
      model: "claude-3-5-haiku-latest",
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          headers: init?.headers,
          body: JSON.parse(String(init?.body)),
        });
        return jsonResponse({
          content: [
            { type: "text", text: "Hello" },
            { type: "text", text: " world" },
          ],
        });
      },
    });

    await expect(
      provider.complete("Write a follow-up", { temperature: 0.2, maxTokens: 64 }),
    ).resolves.toBe("Hello world");
    expect(requests).toEqual([
      {
        url: "https://api.anthropic.com/v1/messages",
        headers: {
          "content-type": "application/json",
          "x-api-key": "anthropic-key",
          "anthropic-version": "2023-06-01",
        },
        body: {
          model: "claude-3-5-haiku-latest",
          max_tokens: 64,
          temperature: 0.2,
          system: undefined,
          messages: [{ role: "user", content: "Write a follow-up" }],
        },
      },
    ]);
    expect(provider.getModelInfo()).toEqual({
      provider: "anthropic",
      model: "claude-3-5-haiku-latest",
      local: false,
    });
  });

  it("moves system messages into Anthropic's top-level system prompt", async () => {
    const bodies: unknown[] = [];
    const provider = new AnthropicProvider({
      apiKey: "anthropic-key",
      model: "claude-3-5-haiku-latest",
      fetch: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return jsonResponse({ content: [{ type: "text", text: "ok" }] });
      },
    });

    const chunks = [];
    for await (const chunk of provider.chat([
      { role: "system", content: "You are concise." },
      { role: "user", content: "Ping" },
    ])) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["ok"]);
    expect(bodies).toEqual([
      {
        model: "claude-3-5-haiku-latest",
        max_tokens: 1024,
        temperature: undefined,
        system: "You are concise.",
        messages: [{ role: "user", content: "Ping" }],
      },
    ]);
  });
});
