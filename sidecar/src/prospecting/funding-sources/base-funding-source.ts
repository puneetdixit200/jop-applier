import type { FundingSource, NormalizedFundingEvent } from "../interfaces.js";

export type FetchJson = (
  url: string,
  headers: Record<string, string>,
) => Promise<unknown>;

export type FetchText = (url: string) => Promise<string>;

export abstract class BaseFundingSource implements FundingSource {
  protected constructor(public readonly id: string) {}

  abstract fetchFundingEvents(): Promise<NormalizedFundingEvent[]>;
}
