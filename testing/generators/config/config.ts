import * as fc from "fast-check";

import type { Config } from "@/config/types";
import { DECISION_KINDS, KIND_REGISTRY, NODE_KINDS, SPEC_TREE_SECTION } from "@/lib/spec-tree/config";

/**
 * Canonical minimal config with all registered kinds.
 * Use this as the default fixture wherever withTestEnv or spec-tree generators need a Config.
 * Built entirely from KIND_REGISTRY — no inline string literals.
 */
export const MINIMAL_SPEC_TREE_CONFIG: Config = {
  [SPEC_TREE_SECTION]: { kinds: { ...KIND_REGISTRY } },
};

export const CONFIG_GENERATOR = {
  validSpecTreeConfig: arbitraryValidSpecTreeConfig,
} as const;

export function sampleConfigValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { numRuns: 1 });
  if (value === undefined) throw new Error("Config generator returned no sample");
  return value;
}

/**
 * Generates valid Config objects with arbitrary non-empty subsets of the registered kinds.
 * Every generated config contains at least one node kind and one decision kind,
 * satisfying the minimum contract for spec-tree generators (arbitraryNodePath, arbitraryDecisionPath).
 */
function arbitraryValidSpecTreeConfig(): fc.Arbitrary<Config> {
  return fc
    .record({
      nodeSubset: fc.subarray([...NODE_KINDS], { minLength: 1 }),
      decisionSubset: fc.subarray([...DECISION_KINDS], { minLength: 1 }),
    })
    .map(({ nodeSubset, decisionSubset }) => ({
      [SPEC_TREE_SECTION]: {
        kinds: Object.fromEntries([...nodeSubset, ...decisionSubset].map((k) => [k, KIND_REGISTRY[k]])),
      },
    }));
}
