export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export async function readJson<T>(response: Response, context: string): Promise<T> {
  if (!response.ok) {
    throw new Error(`${context} failed with HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export function requestHeaders(apiKey: string, extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

