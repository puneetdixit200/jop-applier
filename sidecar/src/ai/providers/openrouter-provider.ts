import type {
  AIProvider,
  ChatMessage,
  ChatOptions,
  CompletionOptions,
  ModelInfo,
} from "../provider-interface.js";
import { readJson, requestHeaders, trimTrailingSlash, type FetchLike } from "./http.js";

type OpenRouterProviderConfig = {
  apiKey: string;
  model: string;
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

export class OpenRouterProvider implements AIProvider {
  private readonly baseUrl: string;
  private readonly fetchClient: FetchLike;

  constructor(private readonly config: OpenRouterProviderConfig) {
    this.baseUrl = trimTrailingSlash(config.baseUrl ?? "https://openrouter.ai/api/v1");
    this.fetchClient = config.fetch ?? fetch;
  }

  async *chat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string> {
    yield await this.chatCompletion(messages, options);
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    return this.chatCompletion([{ role: "user", content: prompt }], options);
  }

  async embed(): Promise<number[]> {
    throw new Error("OpenRouterProvider does not expose a stable embeddings endpoint");
  }

  async isAvailable(): Promise<boolean> {
    return this.config.apiKey.trim().length > 0;
  }

  getModelInfo(): ModelInfo {
    return {
      provider: "openrouter",
      model: this.config.model,
      local: false,
    };
  }

  private async chatCompletion(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    if (!(await this.isAvailable())) {
      throw new Error("OpenRouter API key is not configured");
    }

    const response = await this.fetchClient(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: requestHeaders(this.config.apiKey, {
        "HTTP-Referer": "https://github.com/puneetdixit200/jop-applier",
        "X-Title": "cluelyy",
      }),
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
      }),
    });
    const payload = await readJson<ChatCompletionResponse>(response, "OpenRouter chat completion");
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("OpenRouter response missing assistant content");
    }
    return content;
  }
}

