import { describe, expect, it } from "vitest";
import { OpenAIProvider } from "./openai-provider.js";

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response;
}

describe("OpenAIProvider", () => {
  it("creates embeddings through the OpenAI embeddings endpoint", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const provider = new OpenAIProvider({
      apiKey: "test-key",
      model: "gpt-4.1-mini",
      embeddingModel: "text-embedding-3-small",
      fetch: async (url, init) => {
        requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        return jsonResponse({ data: [{ embedding: [0.1, 0.2, 0.3] }] });
      },
    });

    await expect(provider.embed("React Rust desktop job")).resolves.toEqual([0.1, 0.2, 0.3]);
    expect(requests).toEqual([
      {
        url: "https://api.openai.com/v1/embeddings",
        body: {
          model: "text-embedding-3-small",
          input: "React Rust desktop job",
        },
      },
    ]);
  });
});

