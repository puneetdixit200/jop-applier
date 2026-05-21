export type RateLimit = {
  requests: number;
  perSeconds: number;
};

export type SearchQuery = {
  keywords: string[];
  location?: string;
  remote?: boolean;
  experienceLevel?: "intern" | "entry" | "mid" | "senior";
  datePosted?: "past24h" | "pastWeek" | "pastMonth";
  jobType?: "fulltime" | "parttime" | "contract" | "internship";
  salary?: {
    min?: number;
    max?: number;
    currency: string;
  };
  companies?: string[];
  excludeCompanies?: string[];
};

export type RawJobListing = {
  sourceId: string;
  platform: string;
  url: string;
  title: string;
  company: string;
  location: string;
  salary?: string;
  postedDate?: Date;
  description?: string;
  rawHtml?: string;
};

export type RawJobDetails = {
  url: string;
  description: string;
  requirements?: string[];
  rawHtml?: string;
};

export type Credentials = {
  username?: string;
  password?: string;
  token?: string;
};

export type Session = {
  connector: string;
  authenticatedAt: Date;
  expiresAt?: Date;
};

export type ConnectorHealth = {
  ok: boolean;
  message: string;
};

export interface JobConnector {
  readonly name: string;
  readonly platform: string;
  readonly rateLimit: RateLimit;

  search(query: SearchQuery): AsyncGenerator<RawJobListing>;
  getJobDetails(url: string): Promise<RawJobDetails>;

  login(credentials: Credentials): Promise<Session>;
  isLoggedIn(): Promise<boolean>;

  healthCheck(): Promise<ConnectorHealth>;
}

