import { CustomRssSource } from "./custom-rss-source.js";
import type { FetchText } from "./base-funding-source.js";

export class VcCircleSource extends CustomRssSource {
  constructor(options: { feedUrl?: string; fetchText?: FetchText } = {}) {
    super({
      id: "vccircle",
      feedUrl: options.feedUrl ?? "https://www.vccircle.com/rss",
      region: "india",
      fetchText: options.fetchText,
    });
  }
}
