import type {
  AIProvider,
  ChatMessage,
  ChatOptions,
  CompletionOptions,
  ModelInfo,
} from "../provider-interface.js";
import { readJson, trimTrailingSlash, type FetchLike } from "./http.js";

type AnthropicProviderConfig = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  version?: string;
  fetch?: FetchLike;
};

type AnthropicMessageResponse = {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
};

export class AnthropicProvider implements AIProvider {
  private readonly baseUrl: string;
  private readonly version: string;
  private readonly fetchClient: FetchLike;

  constructor(private readonly config: AnthropicProviderConfig) {
    this.baseUrl = trimTrailingSlash(config.baseUrl ?? "https://api.anthropic.com/v1");
    this.version = config.version ?? "2023-06-01";
    this.fetchClient = config.fetch ?? fetch;
  }

  async *chat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string> {
    yield await this.messageCompletion(messages, options);
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    return this.messageCompletion([{ role: "user", content: prompt }], options);
  }

  async embed(): Promise<number[]> {
    throw new Error("AnthropicProvider does not expose a stable embeddings endpoint");
  }

  async isAvailable(): Promise<boolean> {
    return this.config.apiKey.trim().length > 0;
  }

  getModelInfo(): ModelInfo {
    return {
      provider: "anthropic",
      model: this.config.model,
      local: false,
    };
  }

  private async messageCompletion(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    if (!(await this.isAvailable())) {
      throw new Error("Anthropic API key is not configured");
    }

    const response = await this.fetchClient(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": this.version,
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: options?.maxTokens ?? 1024,
        temperature: options?.temperature,
        system: systemPrompt(messages),
        messages: messages
          .filter((message) => message.role !== "system")
          .map((message) => ({ role: message.role, content: message.content })),
      }),
    });
    const payload = await readJson<AnthropicMessageResponse>(response, "Anthropic message");
    const text = payload.content
      ?.filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("");
    if (!text) {
      throw new Error("Anthropic response missing text content");
    }
    return text;
  }
}

function systemPrompt(messages: ChatMessage[]): string | undefined {
  const systemMessages = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content.trim())
    .filter(Boolean);

  return systemMessages.length > 0 ? systemMessages.join("\n\n") : undefined;
}
