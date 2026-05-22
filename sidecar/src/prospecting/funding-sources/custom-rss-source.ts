import type { FundingRegion, NormalizedFundingEvent, RawFundingEvent } from "../interfaces.js";
import { normalizeFundingEvent } from "./funding-normalizer.js";
import { BaseFundingSource, type FetchText } from "./base-funding-source.js";

export type RssFundingSourceOptions = {
  id: string;
  feedUrl: string;
  region: FundingRegion;
  fetchText?: FetchText;
};

export class CustomRssSource extends BaseFundingSource {
  private readonly feedUrl: string;
  private readonly region: FundingRegion;
  private readonly fetchText: FetchText;

  constructor(options: RssFundingSourceOptions) {
    super(options.id);
    this.feedUrl = options.feedUrl;
    this.region = options.region;
    this.fetchText = options.fetchText ?? defaultFetchText;
  }

  async fetchFundingEvents(): Promise<NormalizedFundingEvent[]> {
    const xml = await this.fetchText(this.feedUrl);
    return rssItems(xml).map((item) => normalizeFundingEvent(rawEventFromRssItem(this.id, this.region, item)));
  }
}

type RssItem = {
  title: string;
  link: string;
  pubDate: string;
  description: string | null;
};

function rawEventFromRssItem(source: string, region: FundingRegion, item: RssItem): RawFundingEvent {
  const parsed = parseFundingTitle(item.title);
  return {
    companyName: parsed.companyName,
    companyDomain: null,
    fundingStage: parsed.stage,
    fundingAmount: parsed.amount,
    fundingCurrency: "USD",
    fundingDate: item.pubDate,
    investors: [],
    leadInvestor: parsed.leadInvestor,
    source,
    sourceUrl: item.link,
    region,
    description: item.description,
    techStack: item.description?.match(/\b(React|Node\.js|Node|AWS|Python|Go|Rust|Java)\b/g) ?? [],
  };
}

function parseFundingTitle(title: string) {
  const companyName = title.split(/\s+raises\s+/i)[0]?.trim() || title.trim();
  const amount = title.match(/\$(\d+(?:\.\d+)?\s*[kmb]?)/i)?.[1] ?? null;
  const stage = title.match(/\b(Pre[- ]?Seed|Seed|Series [A-E]|Growth)\b/i)?.[1] ?? "unknown";
  const leadInvestor = title.match(/\bled by\s+(.+)$/i)?.[1]?.trim() ?? null;
  return { companyName, amount, stage, leadInvestor };
}

function rssItems(xml: string): RssItem[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => {
    const item = match[1];
    return {
      title: tagText(item, "title") ?? "",
      link: tagText(item, "link") ?? "",
      pubDate: tagText(item, "pubDate") ?? new Date(0).toUTCString(),
      description: tagText(item, "description"),
    };
  }).filter((item) => item.title && item.link);
}

function tagText(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim() ?? null;
}

async function defaultFetchText(url: string) {
  const response = await fetch(url);
  return response.text();
}
