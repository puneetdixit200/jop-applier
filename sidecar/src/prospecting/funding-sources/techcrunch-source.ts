import { CustomRssSource } from "./custom-rss-source.js";
import type { FetchText } from "./base-funding-source.js";

export class TechCrunchSource extends CustomRssSource {
  constructor(options: { feedUrl?: string; fetchText?: FetchText } = {}) {
    super({
      id: "techcrunch",
      feedUrl: options.feedUrl ?? "https://techcrunch.com/feed/",
      region: "global",
      fetchText: options.fetchText,
    });
  }
}
