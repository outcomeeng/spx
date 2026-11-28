/**
 * The rows of the `local-product-root` Mapping of `spx/18-state.enabler/21-product-root.enabler`,
 * each as the condition a generated nested-product layout meets to stand for it, and the product
 * directory a CLI invocation resolves under `-C` from a process directory outside the layout.
 *
 * @module harnesses/product-root/local-product-root
 */

import { tmpdir } from "node:os";

import { type CliIo, createCliInvocation } from "@/interfaces/cli/product-context";
import type { NestedProductLayout } from "@testing/generators/state/nested-product-layout";

const NO_OUTPUT_IO: CliIo = {
  writeStdout: () => undefined,
  writeStderr: () => undefined,
  writePassThrough: () => undefined,
  writePassThroughError: () => undefined,
  setExitCode: () => undefined,
  exit: (exitCode) => {
    throw new Error(`unexpected exit ${exitCode} while resolving a product context`);
  },
};

function placedAt(layout: NestedProductLayout): readonly boolean[] {
  return layout.levels.map((level) => level.placed !== null);
}

function onlyToplevelPlaced(layout: NestedProductLayout): boolean {
  const placed = placedAt(layout);
  return layout.insideRepository && placed.length >= 2 && placed.slice(0, -1).every((p) => !p)
    && placed.at(-1) === true;
}

/** Each case of the `local-product-root` Mapping, by its case slug. */
export const LOCAL_PRODUCT_ROOT_ROWS: Readonly<Record<string, (layout: NestedProductLayout) => boolean>> = {
  "config-at-invocation": (layout) =>
    layout.insideRepository && placedAt(layout).length >= 2 && placedAt(layout)[0] === true,
  "config-at-ancestor": (layout) =>
    layout.insideRepository && placedAt(layout)[0] === false && placedAt(layout).slice(1, -1).includes(true),
  "config-at-toplevel": onlyToplevelPlaced,
  "no-config": (layout) => layout.insideRepository && placedAt(layout).every((p) => !p),
  "outside-git": (layout) => !layout.insideRepository,
};

/** A layout inside a repository whose only placed `spx.config.*` stands at the git toplevel, below an invocation directory. */
export const standsForConfigOnlyAtToplevel = onlyToplevelPlaced;

/** The product context a CLI invocation resolves with `-C` naming `invocationDir`, from the OS temp directory. */
export function productContextUnderDirectoryOption(
  invocationDir: string,
): { readonly productDir: string; readonly warning?: unknown } {
  return createCliInvocation({
    readDirectoryOption: () => invocationDir,
    processCwd: tmpdir,
    writeWarning: () => undefined,
    io: NO_OUTPUT_IO,
  }).resolveProductContext();
}
