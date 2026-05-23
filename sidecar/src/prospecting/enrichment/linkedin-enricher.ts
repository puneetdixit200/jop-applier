import { BaseEnricher } from "./base-enricher.js";
import type {
  DiscoveredProspectContact,
  ProspectCompanyForEnrichment,
} from "./enrichment-engine.js";
import { contactFromCandidate, roleFromTitle, uniqueContacts } from "./contact-mapper.js";

export type LinkedInProfileCandidate = {
  name: string;
  title?: string | null;
  email?: string | null;
  profileUrl?: string | null;
};

export type LinkedInEnricherOptions = {
  scrapeCompanyPeople?: (company: ProspectCompanyForEnrichment) => Promise<LinkedInProfileCandidate[]>;
  fetchText?: (url: string) => Promise<string>;
  maxProfiles?: number;
};

export class LinkedInEnricher extends BaseEnricher {
  private readonly scrapeCompanyPeople?: (company: ProspectCompanyForEnrichment) => Promise<LinkedInProfileCandidate[]>;
  private readonly fetchText?: (url: string) => Promise<string>;
  private readonly maxProfiles: number;

  constructor(options: LinkedInEnricherOptions = {}) {
    super("linkedin");
    this.scrapeCompanyPeople = options.scrapeCompanyPeople;
    this.fetchText = options.fetchText;
    this.maxProfiles = options.maxProfiles ?? 10;
  }

  findContacts = async (company: ProspectCompanyForEnrichment): Promise<DiscoveredProspectContact[]> => {
    if (this.scrapeCompanyPeople) {
      const candidates = await this.scrapeCompanyPeople(company);
      return uniqueContacts(candidates.slice(0, this.maxProfiles).flatMap((candidate) => contactFromCandidate({
        fullName: candidate.name,
        email: candidate.email,
        title: candidate.title,
        confidence: candidate.email ? 0.7 : 0,
        source: this.id,
        linkedinUrl: candidate.profileUrl,
      }) ?? []));
    }

    if (!this.fetchText || !company.linkedin_url) {
      return [];
    }

    const html = await this.fetchText(company.linkedin_url);
    return peopleFromLinkedInHtml(html).slice(0, this.maxProfiles);
  };
}

function peopleFromLinkedInHtml(html: string): DiscoveredProspectContact[] {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const contacts: DiscoveredProspectContact[] = [];
  for (const match of text.matchAll(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s+(Talent Acquisition|Recruiter|HR Manager|People Ops|Founder|CEO|CTO|Engineering Manager|Head of Engineering)[^@]{0,120}([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})?/gi)) {
    const email = match[3] ?? "";
    if (!email) {
      continue;
    }
    contacts.push({
      fullName: match[1],
      email: email.toLowerCase(),
      role: roleFromTitle(match[2]),
      confidence: 0.7,
      source: "linkedin",
      linkedinUrl: null,
    });
  }
  return uniqueContacts(contacts);
}
