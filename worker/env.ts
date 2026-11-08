export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  ASSETS: Fetcher;
  AI: Ai;
  /** The promo funnel's `promo_events` dataset, shared with the author's other sites (worker/promo.ts). */
  PROMO_ANALYTICS: AnalyticsEngineDataset;
  /** Server-side OpenAI credential for writing checks; definitions use Workers AI. */
  OPENAI_API_KEY?: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  /** Set only on a local Worker to use the production account and data. */
  DEVELOPMENT_UPSTREAM?: string;
  /** Shared only by production and trusted development Workers. */
  DEVELOPMENT_BRIDGE_SECRET?: string;
}
