export type ProcessEnvValues = Readonly<Record<string, string>>;

/**
 * Sets the given `process.env` values for the callback's duration and restores
 * every key to its prior state (deleting keys that were unset) when the
 * callback returns or throws. Exposes no observation or verdict: the callback
 * owns what it reads and asserts.
 */
export async function withProcessEnv(
  values: ProcessEnvValues,
  callback: () => Promise<void>,
): Promise<void> {
  const prior = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    prior.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    await callback();
  } finally {
    for (const [key, value] of prior) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
