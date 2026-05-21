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

export type JobForContent = JobForMatching & {
  companyName?: string;
  location?: string;
  requirements?: string[];
  url?: string;
};

export type ProfileForMatching = {
  headline: string;
  skills: string[];
};

export type ProfileForContent = {
  fullName?: string;
  headline?: string;
  location?: string;
  summary?: string;
  skills?: string[];
  [key: string]: unknown;
};

export type ResumeContent = ProfileForContent & {
  experience?: unknown[];
  education?: unknown[];
  projects?: unknown[];
  certifications?: unknown[];
};

export type TailoredResume = ResumeContent & {
  summary: string;
  skills: string[];
  tailoringNotes: string[];
};

export type CompanyForEmail = {
  name: string;
  contactName?: string;
  domain?: string;
  industry?: string;
  context?: string;
};

export type ClassifiedJobPosting = {
  title: string;
  companyName: string;
  location: string | null;
  description: string;
  requirements: string[];
  jobType: string | null;
  experienceLevel: string | null;
  remote: boolean;
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
