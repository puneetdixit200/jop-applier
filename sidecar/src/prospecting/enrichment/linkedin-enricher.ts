import { BaseEnricher } from "./base-enricher.js";

export class LinkedInEnricher extends BaseEnricher {
  constructor() {
    super("linkedin");
  }

  findContacts = async () => [];
}
