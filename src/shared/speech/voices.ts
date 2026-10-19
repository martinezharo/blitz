import type { Language } from '@blitz/core/word.ts';

/**
 * One Piper voice per language, run in the browser so every device speaks
 * with the very same one. Both are free to use: Thorsten is CC0, Cori is
 * read from public-domain LibriVox recordings.
 *
 * The Worker streams the pinned Hugging Face models from our own origin,
 * avoiding the CDN's CORS restrictions. Their hashes are checked in the
 * browser, and they stay in Cache Storage after the first download.
 */
export interface Voice {
  name: string;
  url: string;
  /** Also the cache key used before downloads moved to our own origin. */
  sourceUrl: string;
  bytes: number;
  sha256: string;
  /** The eSpeak NG voice the model was trained on. */
  espeak: string;
  sampleRate: number;
  noiseScale: number;
  lengthScale: number;
  noiseW: number;
}

const REVISION = 'c10ece1aade47bb51c153c893d14e5bf8e5b7117';
const model = (path: string) => `https://huggingface.co/rhasspy/piper-voices/resolve/${REVISION}/${path}`;
const voice = (details: Omit<Voice, 'url'>): Voice => ({ ...details, url: `/api/voices/${details.sha256}.onnx` });

export const VOICES: Record<Language, Voice> = {
  de: voice({
    name: 'Thorsten',
    sourceUrl: model('de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx'),
    bytes: 63_201_294,
    sha256: '7e64762d8e5118bb578f2eea6207e1a35a8e0c30595010b666f983fc87bb7819',
    espeak: 'de',
    sampleRate: 22_050,
    noiseScale: 0.667,
    lengthScale: 1,
    noiseW: 0.8,
  }),
  en: voice({
    name: 'Cori',
    sourceUrl: model('en/en_GB/cori/medium/en_GB-cori-medium.onnx'),
    bytes: 63_531_379,
    sha256: '1899f98e5fb8310154f3c2973f4b8a929ba7245e722b3d3a85680b833d95f10d',
    espeak: 'en',
    sampleRate: 22_050,
    noiseScale: 0.667,
    lengthScale: 1,
    noiseW: 0.8,
  }),
};

/** Where downloaded voices are kept. A new name drops none; old ones are cleared on load. */
export const VOICE_CACHE = 'blitz-voices-v1';
