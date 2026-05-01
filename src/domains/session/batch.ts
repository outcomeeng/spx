/**
 * Batch processing utilities for session commands.
 *
 * Provides a shared pattern for processing multiple session IDs:
 * run a handler per ID, collect results, report per-ID outcomes,
 * throw if any failed.
 *
 * @module session/batch
 */

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

/**
 * Processes multiple session IDs through a handler function.
 *
 * IDs are processed sequentially in argument order (left-to-right).
 * All IDs are processed regardless of individual failures.
 * Throws BatchError if any ID fails.
 *
 * @param ids - Session IDs to process
 * @param handler - Async function that processes a single ID and returns output
 * @returns Combined output string with per-ID results
 * @throws {BatchError} When one or more IDs fail
 */
export async function processBatch(
  ids: readonly string[],
  handler: (id: string) => Promise<string>,
): Promise<string> {
  const results: BatchItemResult[] = [];

  for (const id of ids) {
    try {
      const output = await handler(id);
      results.push({ id, ok: true, message: output });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ id, ok: false, message });
    }
  }

  const output = results
    .map((r) => r.ok ? r.message : `Error (${r.id}): ${r.message}`)
    .join("\n\n");

  const hasFailures = results.some((r) => !r.ok);
  if (hasFailures) {
    const err = new BatchError(results);
    err.message = `${err.message}\n\n${output}`;
    throw err;
  }

  return output;
}
