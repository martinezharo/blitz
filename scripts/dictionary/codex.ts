import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Asks a model for JSON through the Codex CLI (`codex exec`), so it runs on a
 * ChatGPT subscription rather than an API key. It runs away from the repository:
 * the model has nothing to read or change here.
 */
export async function askModel(
  prompt: string,
  schema: object,
  { model = 'gpt-6-luna', effort = 'low', label = 'ask' }: { model?: string; effort?: string; label?: string } = {},
): Promise<unknown> {
  const dir = join(tmpdir(), 'blitz-codex');
  await mkdir(dir, { recursive: true });
  const schemaFile = join(dir, `${process.pid}-${label}.schema.json`);
  const out = join(dir, `${process.pid}-${label}.json`);
  await writeFile(schemaFile, JSON.stringify(schema));

  const log: string[] = [];
  await new Promise<void>((done, fail) => {
    const child = spawn(
      'codex',
      ['exec', '-m', model, '-c', `model_reasoning_effort="${effort}"`, '-s', 'read-only', '--skip-git-repo-check', '--ephemeral', '--output-schema', schemaFile, '-o', out, '-'],
      { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const timer = setTimeout(() => child.kill('SIGKILL'), 20 * 60_000);
    child.stdout.on('data', (chunk) => log.push(String(chunk)));
    child.stderr.on('data', (chunk) => log.push(String(chunk)));
    child.on('error', fail);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) return done();
      fail(new Error(log.join('').slice(-600) || `codex exited with ${code}`));
    });
    child.stdin.end(prompt);
  });
  return JSON.parse(await readFile(out, 'utf8'));
}
