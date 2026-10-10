/** The Emscripten module piper-phonemize builds into; only what speech uses. */
export interface PiperPhonemize {
  callMain(args: string[]): number;
}

export interface PiperPhonemizeOptions {
  wasmBinary: ArrayBuffer;
  /** Hands over the eSpeak data package instead of letting the module fetch it. */
  getPreloadedPackage: (name: string, size: number) => ArrayBuffer;
  print: (line: string) => void;
  printErr: (line: string) => void;
}

declare const createPiperPhonemize: (options: PiperPhonemizeOptions) => Promise<PiperPhonemize>;
export default createPiperPhonemize;
