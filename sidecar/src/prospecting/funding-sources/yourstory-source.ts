import { CustomRssSource } from "./custom-rss-source.js";
import type { FetchText } from "./base-funding-source.js";

export class YourStorySource extends CustomRssSource {
  constructor(options: { feedUrl?: string; fetchText?: FetchText } = {}) {
    super({
      id: "yourstory",
      feedUrl: options.feedUrl ?? "https://yourstory.com/feed",
      region: "india",
      fetchText: options.fetchText,
    });
  }
}
