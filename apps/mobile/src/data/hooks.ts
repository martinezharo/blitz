import { useMemo, useSyncExternalStore } from 'react';
import type { Day } from '@blitz/core/streak.ts';
import { type Language, type Word } from '@blitz/core/word.ts';
import type { Correction } from '@blitz/core/writing.ts';
import { currentRevision, subscribe } from './db.ts';
import { practiceDays } from './streak.ts';
import { subscribeSync, syncState, type SyncStatus } from './sync.ts';
import { listWords } from './words.ts';
import { listCorrections } from './writing.ts';
import { subscribeVoice, voiceState, type VoiceState } from '../platform/speech.ts';

/** Reads the store again whenever anything is written, like the web's live queries. */
function useRevision(): number {
  return useSyncExternalStore(subscribe, currentRevision, currentRevision);
}

/** Every word of the language, newest first. */
export function useWords(language: Language): Word[] {
  const revision = useRevision();
  return useMemo(() => listWords(language), [language, revision]);
}

export function useCorrections(language: Language): Correction[] {
  const revision = useRevision();
  return useMemo(() => listCorrections(language), [language, revision]);
}

export function usePracticeDays(): Day[] {
  useRevision();
  return useMemo(() => practiceDays(), []);
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribeSync, syncState, syncState).status;
}

export function useVoice(language: Language): VoiceState {
  return useSyncExternalStore(subscribeVoice, () => voiceState(language), () => voiceState(language));
}
