import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The dictionary is a folder per kind (de, en, de-rev) of small JSON files, one
 * per two first letters of the word: public/dict/de/sc.json. These read and
 * write them for the scripts that change the dictionary in place.
 */

/** Every file of a kind, by name. A kind that is not there (a partial copy) is empty. */
export async function readShards<T>(dict: string, kind: string): Promise<Map<string, T[]>> {
  const dir = join(dict, kind);
  const shards = new Map<string, T[]>();
  const files = await readdir(dir).catch((error: NodeJS.ErrnoException) => (error.code === 'ENOENT' ? [] : Promise.reject(error)));
  for (const file of files) shards.set(file.replace(/\.json$/, ''), JSON.parse(await readFile(join(dir, file), 'utf8')) as T[]);
  return shards;
}

/** The entries of every file of a kind. */
export async function readEntries<T>(dict: string, kind: string): Promise<T[]> {
  return [...(await readShards<T>(dict, kind)).values()].flat();
}

/** How the files read now, to be told later which of them changed. */
export const serialised = <T>(shards: Map<string, T[]>) => new Map([...shards].map(([key, shard]) => [key, JSON.stringify(shard)]));

/** Writes only the files whose content changed since `before`. Returns how many. */
export async function writeShards<T>(dict: string, kind: string, shards: Map<string, T[]>, before: Map<string, string>): Promise<number> {
  const dir = join(dict, kind);
  await mkdir(dir, { recursive: true });
  let changed = 0;
  for (const [key, shard] of shards) {
    const json = JSON.stringify(shard);
    if (before.get(key) === json) continue;
    await writeFile(join(dir, `${key}.json`), json);
    changed++;
  }
  return changed;
}
