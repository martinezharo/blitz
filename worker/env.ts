export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  /** Made speech clips, one per voice and text: `say/<language>/<hash>.wav`. */
  AUDIO: R2Bucket;
  ASSETS: Fetcher;
  AI: Ai;
  /**
   * The Piper service that makes a clip the first time it is asked for (see
   * `tts/`). Optional: without it the app simply has no voice, and the web app
   * keeps making its own.
   */
  TTS_URL?: string;
  TTS_SECRET?: string;
  /** Server-side OpenAI credential for writing checks; definitions use Workers AI. */
  OPENAI_API_KEY?: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  /** Set only on a local Worker to use the production account and data. */
  DEVELOPMENT_UPSTREAM?: string;
  /** Shared only by production and trusted development Workers. */
  DEVELOPMENT_BRIDGE_SECRET?: string;
}
