import type { ContactEnricher } from "./enrichment-engine.js";

export abstract class BaseEnricher implements ContactEnricher {
  protected constructor(public readonly id: string) {}

  abstract findContacts: ContactEnricher["findContacts"];
}
