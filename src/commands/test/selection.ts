import { applyPathFilter, type PathFilterConfig } from "@/config/primitives/path-filter";
import { resolveTargetedTestFiles, type TargetSelection } from "@/lib/test-targeting";

import { discoverTestFiles } from "./discovery";

export interface TestSelectionOptions {
  readonly productDir: string;
  /** When present, discovered files are filtered by this scope (`spx test passing`). */
  readonly passingScope?: PathFilterConfig;
  /** When present with operands, only the operand-selected files are selected; passing scope still applies. */
  readonly targets?: TargetSelection;
}

export interface TestSelection {
  /** The selected test files, as product-relative POSIX paths in discovery order. */
  readonly selected: readonly string[];
  /** Operands that matched no discovered test file. */
  readonly unresolvedTargets: readonly string[];
}

const NO_UNRESOLVED_TARGETS: readonly string[] = [];

/**
 * Resolves the test files a request selects: discovery, then explicit operand
 * targeting, then the passing scope. The dispatch and the recorded-run lookup both
 * consume this one function, so a lookup and a dispatch address one file set.
 */
export async function selectTestFiles(options: TestSelectionOptions): Promise<TestSelection> {
  const discovered = await discoverTestFiles(options.productDir);
  // Explicit operands narrow the discovered set before passing-scope; with no
  // operands the full discovered set carries through unchanged.
  const targeted = options.targets === undefined
    ? { selected: discovered, unresolved: NO_UNRESOLVED_TARGETS }
    : resolveTargetedTestFiles(discovered, options.targets, { productDir: options.productDir });
  const selected = options.passingScope === undefined
    ? targeted.selected
    : applyPathFilter(targeted.selected, options.passingScope);
  return { selected, unresolvedTargets: targeted.unresolved };
}
