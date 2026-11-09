/** The most a model may write in one call, reasoning included. */
export const MAX_OUTPUT_TOKENS = 4000;

export const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;

/**
 * The JSON object of a completed final answer from the Responses API; reasoning,
 * refusals and partial JSON are never an answer. Null when there is none.
 */
export function answerJson(answer: unknown): Record<string, unknown> | null {
  const response = record(answer);
  if (response?.status !== 'completed' || !Array.isArray(response.output)) return null;
  let content = '';
  for (const item of response.output) {
    const message = record(item);
    if (message?.type !== 'message') continue;
    if (message.status !== 'completed' || !Array.isArray(message.content)) return null;
    for (const part of message.content) {
      const block = record(part);
      if (block?.type === 'refusal') return null;
      if (block?.type === 'output_text' && typeof block.text === 'string') content += block.text;
    }
  }
  try { return record(JSON.parse(content)); } catch { return null; }
}
