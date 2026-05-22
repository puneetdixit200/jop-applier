import { BaseEnricher } from "./base-enricher.js";

export class WebsiteEnricher extends BaseEnricher {
  constructor() {
    super("website");
  }

  findContacts = async () => [];
}
