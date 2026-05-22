export type FundingStage =
  | "pre_seed"
  | "seed"
  | "series_a"
  | "series_b"
  | "series_c"
  | "series_d"
  | "series_e"
  | "growth"
  | "private_equity"
  | "unknown";

export type FundingRegion = "india" | "global" | "us" | "eu" | "sea";

export type NormalizedFundingEvent = {
  companyName: string;
  companyDomain: string | null;
  companyLinkedIn: string | null;
  fundingStage: FundingStage;
  fundingAmount: number | null;
  fundingCurrency: string;
  fundingDate: Date;
  investors: string[];
  leadInvestor: string | null;
  source: string;
  sourceUrl: string;
  region: FundingRegion;
  description?: string | null;
  techStack?: string[];
  headcount?: number | null;
  aiSummary?: string | null;
  relevanceScore?: number | null;
};

export type RawFundingEvent = {
  companyName: string;
  companyDomain?: string | null;
  companyLinkedIn?: string | null;
  fundingStage?: string | null;
  fundingAmount?: string | number | null;
  fundingCurrency?: string | null;
  fundingDate: string | Date;
  investors?: string | string[] | null;
  leadInvestor?: string | null;
  source: string;
  sourceUrl: string;
  region?: string | null;
  description?: string | null;
  techStack?: string | string[] | null;
  headcount?: number | null;
};

export type FundingSource = {
  id: string;
  fetchFundingEvents(): Promise<NormalizedFundingEvent[]>;
};
