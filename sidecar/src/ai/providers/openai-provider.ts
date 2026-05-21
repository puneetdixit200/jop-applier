import type {
  AIProvider,
  ChatMessage,
  ChatOptions,
  CompletionOptions,
  ModelInfo,
} from "../provider-interface.js";
import { readJson, requestHeaders, trimTrailingSlash, type FetchLike } from "./http.js";

type OpenAIProviderConfig = {
  apiKey: string;
  model: string;
  embeddingModel?: string;
  baseUrl?: string;
  fetch?: FetchLike;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type EmbeddingResponse = {
  data?: Array<{
    embedding?: number[];
  }>;
};

export class OpenAIProvider implements AIProvider {
  private readonly baseUrl: string;
  private readonly embeddingModel: string;
  private readonly fetchClient: FetchLike;

  constructor(private readonly config: OpenAIProviderConfig) {
    this.baseUrl = trimTrailingSlash(config.baseUrl ?? "https://api.openai.com/v1");
    this.embeddingModel = config.embeddingModel ?? "text-embedding-3-small";
    this.fetchClient = config.fetch ?? fetch;
  }

  async *chat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string> {
    yield await this.chatCompletion(messages, options);
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    return this.chatCompletion([{ role: "user", content: prompt }], options);
  }

  async embed(text: string): Promise<number[]> {
    if (!(await this.isAvailable())) {
      throw new Error("OpenAI API key is not configured");
    }

    const response = await this.fetchClient(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: requestHeaders(this.config.apiKey),
      body: JSON.stringify({
        model: this.embeddingModel,
        input: text,
      }),
    });
    const payload = await readJson<EmbeddingResponse>(response, "OpenAI embeddings");
    const embedding = payload.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) {
      throw new Error("OpenAI embedding response missing vector");
    }
    return embedding;
  }

  async isAvailable(): Promise<boolean> {
    return this.config.apiKey.trim().length > 0;
  }

  getModelInfo(): ModelInfo {
    return {
      provider: "openai",
      model: this.config.model,
      local: false,
    };
  }

  private async chatCompletion(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    if (!(await this.isAvailable())) {
      throw new Error("OpenAI API key is not configured");
    }

    const response = await this.fetchClient(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: requestHeaders(this.config.apiKey),
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
      }),
    });
    const payload = await readJson<ChatCompletionResponse>(response, "OpenAI chat completion");
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("OpenAI response missing assistant content");
    }
    return content;
  }
}

