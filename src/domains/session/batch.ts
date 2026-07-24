/**
 * Batch processing utilities for session commands.
 *
 * Provides a shared pattern for processing multiple session IDs:
 * run a handler per ID, collect results, report per-ID outcomes,
 * throw if any failed.
 *
 * @module session/batch
 */

import {
  authoredText,
  externalValue,
  joinTerminalText,
  renderTerminalText,
  terminal,
  type TerminalText,
} from "@/lib/terminal-text/terminal-text";

/**
 * Result of processing a single session ID within a batch.
 */
export interface BatchItemResult {
  /** The session ID that was processed. */
  id: string;
  /** Whether the operation succeeded. */
  ok: boolean;
  /** Output message on success, error message on failure. */
  message: string;
}

/**
 * Error thrown when a batch operation has partial or total failures.
 * Contains per-ID results so the caller knows which succeeded and which failed.
 */
export class BatchError extends Error {
  readonly results: readonly BatchItemResult[];

  constructor(results: readonly BatchItemResult[]) {
    const failures = results.filter((r) => !r.ok);
    const successes = results.filter((r) => r.ok);
    super(
      `${failures.length} of ${results.length} operations failed. `
        + `${successes.length} succeeded.`,
    );
    this.name = "BatchError";
    this.results = results;
  }
}

/** Separator between one batch item's output and the next. */
const BATCH_ITEM_SEPARATOR = "\n\n";
/** Prefix stating which id failed, before the failure's own message. */
const BATCH_FAILURE_LABEL = "Error";

/**
 * Runs every id through the handler in argument order, collecting each outcome. Every id is
 * processed regardless of individual failures, so one bad id never hides the rest.
 */
async function collectBatch(
  ids: readonly string[],
  handler: (id: string) => Promise<string>,
): Promise<BatchItemResult[]> {
  const results: BatchItemResult[] = [];

  for (const id of ids) {
    try {
      const output = await handler(id);
      results.push({ id, ok: true, message: output });
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      results.push({ id, ok: false, message });
    }
  }

  return results;
}

/** Raises the partial-failure error carrying the joined per-id outcomes. */
function throwBatchFailure(results: readonly BatchItemResult[], output: string): never {
  const err = new BatchError(results);
  err.message = `${err.message}${BATCH_ITEM_SEPARATOR}${output}`;
  throw err;
}

/**
 * Processes multiple session IDs whose per-id output is a relayed document — the session file's
 * own bytes. The batch joins those documents without composing them, because the payload is the
 * stored artifact rather than a report the product wrote about it.
 *
 * @param ids - Session IDs to process
 * @param handler - Async function that processes a single ID and returns its document
 * @returns The joined documents
 * @throws {BatchError} When one or more IDs fail
 */
export async function processBatch(
  ids: readonly string[],
  handler: (id: string) => Promise<string>,
): Promise<string> {
  const results = await collectBatch(ids, handler);

  const output = results
    .map((r) => r.ok ? r.message : `${BATCH_FAILURE_LABEL} (${r.id}): ${r.message}`)
    .join(BATCH_ITEM_SEPARATOR);

  if (results.some((r) => !r.ok)) {
    throwBatchFailure(results, output);
  }

  return output;
}

/**
 * Processes multiple session IDs whose per-id output is composed spx text. Each item keeps the
 * escaping decision made where its values were embedded, while the failure prefix escapes the id
 * it names — an id reaches the batch from the command line, so it is an external reading.
 *
 * @param ids - Session IDs to process
 * @param handler - Async function that processes a single ID and returns its composed output
 * @returns The joined composition
 * @throws {BatchError} When one or more IDs fail
 */
export async function processComposedBatch(
  ids: readonly string[],
  handler: (id: string) => Promise<TerminalText>,
): Promise<TerminalText> {
  const results = await collectBatch(ids, handler);

  const output = joinTerminalText(
    BATCH_ITEM_SEPARATOR,
    results.map((r) =>
      r.ok
        ? authoredText(r.message)
        : terminal`${authoredText(BATCH_FAILURE_LABEL)} (${externalValue(r.id)}): ${externalValue(r.message)}`
    ),
  );

  if (results.some((r) => !r.ok)) {
    throwBatchFailure(results, renderTerminalText(output));
  }

  return output;
}
