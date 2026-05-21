import type {
  AIProvider,
  ChatMessage,
  ChatOptions,
  CompletionOptions,
  ModelInfo,
} from "../provider-interface.js";
import { readJson, trimTrailingSlash, type FetchLike } from "./http.js";

type OllamaProviderConfig = {
  baseUrl?: string;
  model: string;
  embeddingModel?: string;
  fetch?: FetchLike;
};

type OllamaTagsResponse = {
  models?: Array<{ name?: string; model?: string }>;
};

type OllamaCompletionResponse = {
  response?: string;
};

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
};

type OllamaEmbeddingResponse = {
  embedding?: number[];
};

export class OllamaProvider implements AIProvider {
  private readonly baseUrl: string;
  private readonly embeddingModel: string;
  private readonly fetchClient: FetchLike;

  constructor(private readonly config: OllamaProviderConfig) {
    this.baseUrl = trimTrailingSlash(config.baseUrl ?? "http://localhost:11434");
    this.embeddingModel = config.embeddingModel ?? config.model;
    this.fetchClient = config.fetch ?? fetch;
  }

  async *chat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string> {
    const response = await this.fetchClient(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        stream: false,
        options: {
          temperature: options?.temperature,
          num_predict: options?.maxTokens,
        },
      }),
    });
    const payload = await readJson<OllamaChatResponse>(response, "Ollama chat");
    yield payload.message?.content ?? "";
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    const response = await this.fetchClient(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.config.model,
        prompt,
        stream: false,
        options: {
          temperature: options?.temperature,
          num_predict: options?.maxTokens,
        },
      }),
    });
    const payload = await readJson<OllamaCompletionResponse>(response, "Ollama completion");
    if (typeof payload.response !== "string") {
      throw new Error("Ollama completion response missing response text");
    }
    return payload.response;
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.fetchClient(`${this.baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.embeddingModel,
        prompt: text,
      }),
    });
    const payload = await readJson<OllamaEmbeddingResponse>(response, "Ollama embedding");
    if (!Array.isArray(payload.embedding)) {
      throw new Error("Ollama embedding response missing embedding");
    }
    return payload.embedding;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.fetchClient(`${this.baseUrl}/api/tags`);
      const payload = await readJson<OllamaTagsResponse>(response, "Ollama tags");
      return Boolean(
        payload.models?.some((model) => model.name === this.config.model || model.model === this.config.model),
      );
    } catch {
      return false;
    }
  }

  getModelInfo(): ModelInfo {
    return {
      provider: "ollama",
      model: this.config.model,
      local: true,
    };
  }
}

