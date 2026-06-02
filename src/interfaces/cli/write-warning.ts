/**
 * Writes a CLI diagnostic warning to standard error.
 *
 * Short-circuits when no warning is present, so a descriptor passes an optional
 * warning straight through without a local guard. Appends a trailing newline so
 * the warning occupies its own terminal line.
 *
 * @param warning - The warning text, or `undefined` when there is nothing to emit.
 */
export function writeWarning(warning: string | undefined): void {
  if (warning === undefined) {
    return;
  }
  process.stderr.write(`${warning}\n`);
}
