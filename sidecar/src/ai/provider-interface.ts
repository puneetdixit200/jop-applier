export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatOptions = {
  temperature?: number;
  maxTokens?: number;
};

export type CompletionOptions = ChatOptions;

export type ModelInfo = {
  provider: string;
  model: string;
  local: boolean;
};

export type JobForMatching = {
  title: string;
  description: string;
};

export type ProfileForMatching = {
  headline: string;
  skills: string[];
};

export type MatchResult = {
  score: number;
  reasoning: string;
  tags: string[];
};

export interface AIProvider {
  chat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string>;
  complete(prompt: string, options?: CompletionOptions): Promise<string>;
  embed(text: string): Promise<number[]>;
  isAvailable(): Promise<boolean>;
  getModelInfo(): ModelInfo;
}

