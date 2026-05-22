import { CustomRssSource } from "./custom-rss-source.js";
import type { FetchText } from "./base-funding-source.js";

export class EntrackrSource extends CustomRssSource {
  constructor(options: { feedUrl?: string; fetchText?: FetchText } = {}) {
    super({
      id: "entrackr",
      feedUrl: options.feedUrl ?? "https://entrackr.com/feed/",
      region: "india",
      fetchText: options.fetchText,
    });
  }
}
