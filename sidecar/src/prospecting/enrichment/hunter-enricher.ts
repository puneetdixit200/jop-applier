import { BaseEnricher } from "./base-enricher.js";

export class HunterEnricher extends BaseEnricher {
  constructor() {
    super("hunter");
  }

  findContacts = async () => [];
}
