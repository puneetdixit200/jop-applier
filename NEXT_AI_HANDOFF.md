# Next AI Handoff

## Current State

- Local repo was deleted on request, then re-cloned from `https://github.com/puneetdixit200/jop-applier`.
- This repository is currently the GitHub remote state, not the deleted local working tree.
- The deleted local tree had experimental crawler/HR-enrichment work that was verified locally but was not pushed before deletion.
- This handoff intentionally contains no API keys, tokens, app passwords, Telegram tokens, or Gmail credentials.

## User Intent

The user wants to rebuild this as a production-ready local-first job/apply/outreach app.

Primary recent focus:

- Add a dedicated `Crawler` tab.
- Use Crawlee/RSS/ATS sources to discover jobs.
- Export CSVs that always include:
  - `outreach_email`
  - `hr_name`
  - `hr_title`
  - `hr_email`
  - `hr_email_alt_guesses`
  - `hr_email_status`
  - `hr_email_confidence`
  - `generic_email`
  - `all_emails`
- If an HR/recruiter/hiring name is found, the email guessing system must run.
- If zero jobs are found, still download a diagnostic CSV with the same columns and a reason.

## Important Safety Context

- Do not use Telegram unless the user explicitly asks again. The user said not to use Telegram.
- Do not send Gmail/test emails unless explicitly asked at that moment.
- Earlier credentials were pasted in chat. Treat them as exposed and do not write them to git.
- Use `.env.local` locally only; keep `.env.local` ignored.
- If adding `.env.example`, include names only, no values.

## Crawler Requirements To Rebuild

Seed inputs should support:

- Lever boards: `https://jobs.lever.co/{company}`
- Greenhouse boards: `https://boards.greenhouse.io/{company}`
- Direct company pages: `https://company.com/careers`, `/jobs`, `/openings`
- RSS/Atom feeds

Do not rely on LinkedIn/Naukri scraping as core crawler sources. They block aggressively.

Crawler behavior:

- Use Crawlee for same-host career crawling.
- Follow career/job/opening paths plus people/team/about pages for HR context.
- Prefer ATS JSON/API paths when available.
- Extract JSON-LD `JobPosting` first.
- Add fallback HTML heuristics for job detail pages.
- Dedupe by URL and title/company.
- Tag remote jobs using text signals like `remote`, `work from home`, `wfh`, `anywhere`, `distributed`.
- Store raw HTML when possible for fallback extraction.

## HR/Outreach Enrichment Requirements

Email extraction:

- Extract page emails from `mailto:` and text.
- Split personal emails from generic emails.
- Generic examples: `careers@`, `jobs@`, `hr@`, `hiring@`, `talent@`, `people@`, `recruiting@`.

Name extraction:

- Handle patterns like:
  - `Priya Sharma - Talent Acquisition`
  - `Priya Sharma, Recruiter`
  - `Recruiter: Priya Sharma`
  - `Hiring Manager: Priya Sharma`
  - `Talent Acquisition Partner: Priya Sharma`
  - names with middle initials like `Neha S. Rao`

Guessing rules:

- If name + usable company domain exists, produce guesses:
  - `first.last@domain`
  - `first@domain`
  - `f.last@domain`
  - `firstlast@domain`
  - `firstl@domain`
  - `first_last@domain`
  - `first-last@domain`
- Put the best guess into `outreach_email` and `hr_email`.
- Put alternates into `hr_email_alt_guesses`.
- Mark guessed emails as `Unverified`.
- If a personal email is directly crawled, mark it `Verified`.
- If only generic email exists, mark as `Generic`.

Domain guardrails:

- Do not guess emails for reserved domains: `.test`, `.example`, `.invalid`, `.localhost`, `.local`.
- Do not guess emails for job-board domains like `remoteok.com`, `remotive.com`, `linkedin.com`, `naukri.com`, `indeed.com`, `glassdoor.com`, `jobs.lever.co`, `boards.greenhouse.io`.
- For ATS boards, if a name is found and the board slug is usable, allow a lower-confidence inferred domain, for example:
  - `https://jobs.lever.co/razorpay/...` + `Priya Sharma` -> `priya.sharma@razorpay.com`

## CSV Behavior

CSV header should be stable:

```csv
title,company,location,remote,platform,source_url,outreach_email,hr_name,hr_title,hr_email,hr_email_alt_guesses,hr_email_status,hr_email_confidence,generic_email,all_emails,score,description
```

If no jobs are found:

- Still download `crawler-results-hr-enriched-YYYY-MM-DD-HH-MM-SS.csv`.
- Include the same header.
- Include one diagnostic row with `title = No crawler jobs found` and the reason in `description`.

## Prior Local Verification Before Deletion

The deleted implementation had passed these local checks at least once:

- `npm run build:frontend`
- focused crawler unit tests around CSV/header/name guessing
- sidecar crawler-related tests
- live Playwright download test against a local fixture page

Because the working tree was deleted before pushing, do not assume these changes exist in this repo.

## Suggested Next Steps

1. Install dependencies: `npm install`.
2. Rebuild crawler dependencies:
   - add `crawlee`
   - add `fast-xml-parser`
3. Add frontend `CrawlerPage`.
4. Add `src/lib/crawler-lab.ts` for seed parsing, enrichment, CSV generation, pagination helpers.
5. Add sidecar Crawlee career connector.
6. Extend RSS/Atom feed connector.
7. Wire crawler/feed/ATS sources through `sidecar/src/index.ts` and the browser discovery route.
8. Add focused tests first for:
   - no-results diagnostic CSV
   - name extraction
   - email guessing
   - reserved-domain filtering
   - ATS slug lower-confidence guessing
9. Run:
   - `npm run test:frontend`
   - `npm run test:sidecar`
   - `npm run build:frontend`
   - `npm run build:sidecar`

