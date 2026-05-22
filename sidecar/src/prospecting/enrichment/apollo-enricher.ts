import { BaseEnricher } from "./base-enricher.js";

export class ApolloEnricher extends BaseEnricher {
  constructor() {
    super("apollo");
  }

  findContacts = async () => [];
}
