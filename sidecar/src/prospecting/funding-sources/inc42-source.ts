import { CustomRssSource } from "./custom-rss-source.js";
import type { FetchText } from "./base-funding-source.js";

export class Inc42Source extends CustomRssSource {
  constructor(options: { feedUrl?: string; fetchText?: FetchText } = {}) {
    super({
      id: "inc42",
      feedUrl: options.feedUrl ?? "https://inc42.com/buzz/feed/",
      region: "india",
      fetchText: options.fetchText,
    });
  }
}
