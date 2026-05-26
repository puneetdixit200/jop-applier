import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const sidecarPath = path.join(rootDir, "dist-sidecar", "index.js");
const fallbackJobLimit = 25;

export default defineConfig({
  plugins: [react(), browserDiscoveryApi()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
});

function browserDiscoveryApi() {
  return {
    name: "job-hunt-browser-discovery-api",
    configureServer(server) {
      server.middlewares.use("/api/discovery/run", handleBrowserDiscoveryRequest);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/discovery/run", handleBrowserDiscoveryRequest);
    },
  };
}

async function handleBrowserDiscoveryRequest(request, response) {
  if (request.method !== "POST") {
    response.statusCode = 405;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const body = await readJsonBody(request);
    const discovery = isRecord(body.discovery) ? body.discovery : {};
    const sidecarJobs = await runSidecarDiscovery(discovery).catch(() => []);
    const liveJobs = sidecarJobs.length > 0 ? [] : await fetchLiveFallbackJobs(discovery);
    const jobs = dedupeJobs([...sidecarJobs, ...liveJobs]).slice(0, fallbackJobLimit);

    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        ok: true,
        workflowStatus: `job-discovery completed: ${jobs.length} found`,
        discovered: jobs.length,
        jobs,
        sources: Array.from(new Set(jobs.map((job) => job.platform))),
      }),
    );
  } catch (error) {
    response.statusCode = 500;
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

function readJsonBody(request): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
      }
    });
    request.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON request body"));
      }
    });
    request.on("error", reject);
  });
}

async function runSidecarDiscovery(discovery: Record<string, unknown>) {
  if (!existsSync(sidecarPath)) {
    return [];
  }

  const response = await runSidecarRequest({
    id: "browser-job-discovery",
    method: "workflow.run",
    params: {
      workflowId: "job-discovery",
      discovery,
    },
  });
  const result = isRecord(response.result) ? response.result : {};
  const jobs = Array.isArray(result.jobs) ? result.jobs : [];
  return jobs.filter(isSidecarJob).map((job) => jobFromSidecarJob(job));
}

function runSidecarRequest(payload: unknown): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [sidecarPath, "--stdio"], {
      cwd: rootDir,
      env: {
        ...process.env,
        JOB_HUNT_SIDECAR_PATH: sidecarPath,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const line = stdout.trim().split(/\r?\n/).find((entry) => entry.trim().length > 0);
      if (code !== 0 || !line) {
        reject(new Error(stderr.trim() || `Sidecar exited with ${code}`));
        return;
      }

      try {
        const response = JSON.parse(line);
        if (!response.ok) {
          reject(new Error(response.error?.message ?? response.error ?? "Sidecar discovery failed"));
          return;
        }
        resolve(response);
      } catch {
        reject(new Error("Sidecar returned invalid JSON"));
      }
    });

    child.stdin.end(`${JSON.stringify(payload)}\n`);
  });
}

async function fetchLiveFallbackJobs(discovery: Record<string, unknown>) {
  const queries = discoverySearchQueries(discovery);
  const jobs = [];
  for (const query of queries.length > 0 ? queries : [{ keywords: ["React", "TypeScript"], remote: true }]) {
    const [remotiveJobs, remoteOkJobs] = await Promise.all([
      fetchRemotiveJobs(query).catch(() => []),
      fetchRemoteOkJobs(query).catch(() => []),
    ]);
    jobs.push(...remotiveJobs, ...remoteOkJobs);
  }
  return jobs;
}

async function fetchRemotiveJobs(query: SearchQuery) {
  const url = new URL("https://remotive.com/api/remote-jobs");
  const queryText = queryTextForSearch(query);
  if (queryText) {
    url.searchParams.set("search", queryText);
  }

  const response = await fetch(url, {
    headers: { "user-agent": "job-huntLocalDiscovery/0.1" },
  });
  if (!response.ok) {
    throw new Error(`Remotive discovery returned HTTP ${response.status}`);
  }

  const payload = await response.json();
  const records = isRecord(payload) && Array.isArray(payload.jobs) ? payload.jobs : [];
  return records
    .filter(isRecord)
    .map((record) => remotiveJobToRecord(record, query))
    .filter((job): job is BrowserJob => job !== null);
}

async function fetchRemoteOkJobs(query: SearchQuery) {
  const tag = primaryKeyword(query);
  const url = new URL("https://remoteok.com/api");
  if (tag) {
    url.searchParams.set("tags", tag);
  }

  const response = await fetch(url, {
    headers: { "user-agent": "job-huntLocalDiscovery/0.1" },
  });
  if (!response.ok) {
    throw new Error(`RemoteOK discovery returned HTTP ${response.status}`);
  }

  const payload = await response.json();
  const records = Array.isArray(payload) ? payload.slice(1).filter(isRecord) : [];
  return records
    .map((record) => remoteOkJobToRecord(record, query))
    .filter((job): job is BrowserJob => job !== null);
}

function remotiveJobToRecord(record: Record<string, unknown>, query: SearchQuery): BrowserJob | null {
  const url = text(record.url);
  const title = text(record.title);
  const company = text(record.company_name) ?? text(record.company);
  if (!url || !title || !company) {
    return null;
  }

  const location = text(record.candidate_required_location) ?? "Remote";
  const description = stripHtml(text(record.description) ?? "");
  const requirements = keywordMatches(query, `${title} ${company} ${description}`);
  if (!matchesLocation(query, location) || !matchesAnyKeyword(query, `${title} ${company} ${description}`)) {
    return null;
  }

  return browserJob({
    platform: "remotive",
    sourceId: text(record.id) ?? url,
    url,
    title,
    companyName: company,
    location,
    salary: text(record.salary),
    description,
    requirements,
    tags: ["live", "remote"],
    score: scoreJob(query, `${title} ${company} ${description}`),
  });
}

function remoteOkJobToRecord(record: Record<string, unknown>, query: SearchQuery): BrowserJob | null {
  const url = text(record.url);
  const title = text(record.position) ?? text(record.title);
  const company = text(record.company);
  if (!url || !title || !company) {
    return null;
  }

  const location = text(record.location) ?? "Remote";
  const description = stripHtml(text(record.description) ?? "");
  const recordTags = Array.isArray(record.tags) ? record.tags.filter((tag) => typeof tag === "string") : [];
  const haystack = `${title} ${company} ${description} ${recordTags.join(" ")}`;
  if (!matchesLocation(query, location) || !matchesAnyKeyword(query, haystack)) {
    return null;
  }

  const salaryMin = typeof record.salary_min === "number" && record.salary_min > 0 ? record.salary_min : null;
  const salaryMax = typeof record.salary_max === "number" && record.salary_max > 0 ? record.salary_max : salaryMin;

  return browserJob({
    platform: "remoteok",
    sourceId: text(record.id) ?? url,
    url,
    title,
    companyName: company,
    location,
    salaryMin,
    salaryMax,
    salaryCurrency: "USD",
    description,
    requirements: keywordMatches(query, haystack),
    tags: ["live", ...recordTags.slice(0, 4)],
    score: scoreJob(query, haystack),
  });
}

function jobFromSidecarJob(job: Record<string, unknown>): BrowserJob {
  return browserJob({
    platform: text(job.platform) ?? "sidecar",
    sourceId: text(job.source_id) ?? text(job.url) ?? "sidecar-job",
    url: text(job.url) ?? "",
    title: text(job.title) ?? "Discovered role",
    companyName: text(job.company_name) ?? "Unknown company",
    location: text(job.location) ?? "Location unknown",
    salaryMin: numberOrNull(job.salary_min),
    salaryMax: numberOrNull(job.salary_max),
    salaryCurrency: text(job.salary_currency) ?? "INR",
    description: text(job.description),
    requirements: stringArray(job.requirements),
    tags: stringArray(job.ai_tags),
    score: numberOrNull(job.match_score),
    confidence: numberOrNull(job.match_confidence),
    priority: priorityOrNull(job.ai_priority),
    rawHtml: text(job.raw_html),
  });
}

function browserJob(input: {
  platform: string;
  sourceId: string;
  url: string;
  title: string;
  companyName: string;
  location: string;
  salary?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string;
  description?: string | null;
  requirements?: string[];
  tags?: string[];
  score?: number | null;
  confidence?: number | null;
  priority?: "high" | "medium" | "low" | null;
  rawHtml?: string | null;
}): BrowserJob {
  const salary = input.salary ? parseSalary(input.salary) : null;
  const score = input.score ?? null;
  return {
    id: `browser-${hashText(input.url || `${input.platform}:${input.sourceId}`)}`,
    source_id: input.sourceId,
    platform: input.platform,
    url: input.url,
    title: input.title,
    company_name: input.companyName,
    location: input.location,
    is_remote: /\b(remote|worldwide|anywhere)\b/i.test(input.location),
    salary_min: input.salaryMin ?? salary?.min ?? null,
    salary_max: input.salaryMax ?? salary?.max ?? null,
    salary_currency: input.salaryCurrency ?? salary?.currency ?? "USD",
    job_type: null,
    experience_level: null,
    description: input.description ?? null,
    requirements: input.requirements ?? [],
    raw_html: input.rawHtml ?? null,
    match_score: score,
    match_confidence: input.confidence ?? (score === null ? null : Math.min(0.95, Math.max(0.5, score / 100))),
    match_reasoning: score === null ? null : `Matched ${score}% of browser discovery keywords.`,
    matched_skills: input.requirements ?? [],
    missing_skills: [],
    ai_tags: input.tags ?? [],
    should_apply: score === null ? null : score >= 70,
    ai_priority: input.priority ?? priorityForScore(score),
  };
}

function discoverySearchQueries(discovery: Record<string, unknown>): SearchQuery[] {
  const value = discovery.searchQueries;
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isSearchQuery);
}

function isSearchQuery(value: unknown): value is SearchQuery {
  return (
    isRecord(value) &&
    Array.isArray(value.keywords) &&
    value.keywords.some((keyword) => typeof keyword === "string" && keyword.trim().length > 0)
  );
}

function queryTextForSearch(query: SearchQuery) {
  return query.keywords.map((keyword) => keyword.trim()).filter(Boolean).join(" ");
}

function primaryKeyword(query: SearchQuery) {
  return keywordTerms(query).find((term) => term.length > 2) ?? "";
}

function keywordTerms(query: SearchQuery) {
  return query.keywords
    .flatMap((keyword) => keyword.split(/[^a-z0-9+#.]+/i))
    .map((keyword) => keyword.trim().toLowerCase())
    .filter((keyword) => keyword.length > 1);
}

function matchesAnyKeyword(query: SearchQuery, value: string) {
  const terms = keywordTerms(query);
  if (terms.length === 0) {
    return true;
  }

  const haystack = value.toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function keywordMatches(query: SearchQuery, value: string) {
  const haystack = value.toLowerCase();
  return keywordTerms(query).filter((term) => haystack.includes(term)).slice(0, 8);
}

function scoreJob(query: SearchQuery, value: string) {
  const terms = keywordTerms(query);
  if (terms.length === 0) {
    return 65;
  }

  const matched = keywordMatches(query, value).length;
  return Math.min(95, Math.max(55, Math.round((matched / terms.length) * 100)));
}

function matchesLocation(query: SearchQuery, location: string) {
  const expected = query.location?.trim().toLowerCase();
  if (!expected || expected === "remote") {
    return true;
  }

  const haystack = location.toLowerCase();
  return (
    haystack.includes(expected) ||
    haystack.includes("worldwide") ||
    haystack.includes("anywhere") ||
    (query.remote === true && haystack.includes("remote"))
  );
}

function parseSalary(value: string) {
  const currency = value.match(/\b[A-Z]{3}\b/)?.[0] ?? (value.includes("$") ? "USD" : "USD");
  const numbers = [...value.matchAll(/\d[\d,]*/g)]
    .map((match) => Number(match[0].replace(/,/g, "")))
    .filter((number) => Number.isFinite(number));
  return {
    min: numbers[0] ?? null,
    max: numbers[1] ?? numbers[0] ?? null,
    currency,
  };
}

function dedupeJobs(jobs: BrowserJob[]) {
  const seen = new Set<string>();
  const deduped = [];
  for (const job of jobs) {
    const key = job.url || `${job.platform}:${job.source_id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(job);
  }
  return deduped.sort((left, right) => (right.match_score ?? 0) - (left.match_score ?? 0));
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashText(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function priorityForScore(score: number | null): "high" | "medium" | "low" | null {
  if (score === null) {
    return null;
  }
  if (score >= 80) {
    return "high";
  }
  if (score >= 65) {
    return "medium";
  }
  return "low";
}

function priorityOrNull(value: unknown): "high" | "medium" | "low" | null {
  return value === "high" || value === "medium" || value === "low" ? value : null;
}

function isSidecarJob(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && typeof value.title === "string" && typeof value.company_name === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

type SearchQuery = {
  keywords: string[];
  location?: string;
  remote?: boolean;
};

type BrowserJob = {
  id: string;
  source_id: string | null;
  platform: string;
  url: string;
  title: string;
  company_name: string;
  location: string | null;
  is_remote: boolean;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  job_type: string | null;
  experience_level: string | null;
  description: string | null;
  requirements: string[];
  raw_html: string | null;
  match_score: number | null;
  match_confidence: number | null;
  match_reasoning: string | null;
  matched_skills: string[];
  missing_skills: string[];
  ai_tags: string[];
  should_apply: boolean | null;
  ai_priority: "high" | "medium" | "low" | null;
};
