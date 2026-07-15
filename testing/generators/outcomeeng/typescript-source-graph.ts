/**
 * Pure variable input domains for the TypeScript source-graph provider:
 * test-attributed coverage payloads and module-graph payloads whose expected
 * fact pairs are known by construction — reachable components are built as
 * trees from each test entry, redundant edges never change the reachable set,
 * and noise subgraphs never become reachable from an entry.
 *
 * @module testing/generators/outcomeeng/typescript-source-graph
 */

import { posix } from "node:path";

import * as fc from "fast-check";

import type {
  TypescriptCoverageInput,
  TypescriptModuleEdge,
  TypescriptModuleGraphInput,
} from "@/outcomeeng/spec-tree/graph/source";
import { arbitraryArtifactPath } from "@testing/generators/outcomeeng/source-graph";

/** Namespace prefix isolating each test entry's component from every other component. */
const MODULE_GRAPH_COMPONENT_NAMESPACE = "entry";
/** Namespace prefix isolating the unreachable noise subgraph. */
const MODULE_GRAPH_NOISE_NAMESPACE = "noise";

/** One (testPath, sourcePath) relation a provider payload must map to exactly one fact. */
export type ProviderFactPair = readonly [testPath: string, sourcePath: string];

/** A coverage payload plus the unique fact pairs it must map to. */
export interface TypescriptCoverageScenario {
  readonly input: TypescriptCoverageInput;
  readonly expectedPairs: readonly ProviderFactPair[];
}

interface CoverageEntrySeed {
  readonly coveredSourcePaths: readonly string[];
  readonly duplicateFirstCoveredPath: boolean;
}

function arbitraryCoverageEntrySeed(): fc.Arbitrary<CoverageEntrySeed> {
  return fc
    .record({
      coveredSourcePaths: fc.uniqueArray(arbitraryArtifactPath(), { minLength: 1, maxLength: 3 }),
      duplicateFirstCoveredPath: fc.boolean(),
    })
    .map((seed) => ({
      coveredSourcePaths: seed.coveredSourcePaths,
      duplicateFirstCoveredPath: seed.duplicateFirstCoveredPath,
    }));
}

/** A coverage payload whose entries carry unique test paths and possibly duplicated covered paths. */
export function arbitraryTypescriptCoverageScenario(): fc.Arbitrary<TypescriptCoverageScenario> {
  return fc
    .record({
      testPaths: fc.uniqueArray(arbitraryArtifactPath(), { minLength: 1, maxLength: 3 }),
      seeds: fc.array(arbitraryCoverageEntrySeed(), { minLength: 3, maxLength: 3 }),
    })
    .map(({ testPaths, seeds }) => {
      const entries = testPaths.map((testPath, index) => {
        const seed = seeds[index];
        const duplicated = seed.duplicateFirstCoveredPath
          ? [...seed.coveredSourcePaths, seed.coveredSourcePaths[0]]
          : seed.coveredSourcePaths;
        return { testPath, coveredSourcePaths: duplicated };
      });
      const expectedPairs = testPaths.flatMap((testPath, index) =>
        seeds[index].coveredSourcePaths.map((sourcePath): ProviderFactPair => [
          testPath,
          sourcePath,
        ])
      );
      return { input: { entries }, expectedPairs };
    });
}

/** A module-graph payload plus the (entry, reachable source) pairs it must map to. */
export interface TypescriptModuleGraphScenario {
  readonly input: TypescriptModuleGraphInput;
  readonly expectedPairs: readonly ProviderFactPair[];
}

interface ComponentSeed {
  readonly reachablePaths: readonly string[];
  readonly parentPicks: readonly number[];
  readonly withRedundantEdge: boolean;
}

function prefixPath(prefix: string, path: string): string {
  return `${prefix}${posix.sep}${path}`;
}

/** Tree edges from the entry over the reachable nodes; every node's parent precedes it. */
function componentEdges(
  entryPath: string,
  reachable: readonly string[],
  picks: readonly number[],
): TypescriptModuleEdge[] {
  return reachable.map((importedPath, index) => {
    const pick = picks[index] ?? 0;
    const parents = [entryPath, ...reachable.slice(0, index)];
    return { importerPath: parents[pick % parents.length], importedPath };
  });
}

function arbitraryComponentSeed(): fc.Arbitrary<ComponentSeed> {
  return fc.record({
    reachablePaths: fc.uniqueArray(arbitraryArtifactPath(), { minLength: 1, maxLength: 4 }),
    parentPicks: fc.array(fc.nat({ max: 4 }), { minLength: 4, maxLength: 4 }),
    withRedundantEdge: fc.boolean(),
  });
}

interface NoiseSeed {
  readonly noisePaths: readonly string[];
  readonly linkNoiseToFirstEntry: boolean;
}

function arbitraryNoiseSeed(): fc.Arbitrary<NoiseSeed> {
  return fc.record({
    noisePaths: fc.uniqueArray(arbitraryArtifactPath(), { minLength: 0, maxLength: 2 }),
    linkNoiseToFirstEntry: fc.boolean(),
  });
}

/**
 * A module-graph scenario built from disjoint per-entry tree components, an
 * optional redundant in-component edge that never changes the reachable set,
 * and a noise subgraph whose edges point only among noise nodes or into a
 * component — never from a component into noise.
 */
export function arbitraryTypescriptModuleGraphScenario(): fc.Arbitrary<TypescriptModuleGraphScenario> {
  return fc
    .record({
      entrySeedPaths: fc.uniqueArray(arbitraryArtifactPath(), { minLength: 1, maxLength: 2 }),
      components: fc.array(arbitraryComponentSeed(), { minLength: 2, maxLength: 2 }),
      noise: arbitraryNoiseSeed(),
    })
    .map(({ entrySeedPaths, components, noise }) => {
      const entries = entrySeedPaths.map((path, index) =>
        prefixPath(`${MODULE_GRAPH_COMPONENT_NAMESPACE}-${index}`, path)
      );
      const edges: TypescriptModuleEdge[] = [];
      const expectedPairs: ProviderFactPair[] = [];
      entries.forEach((entryPath, index) => {
        const seed = components[index];
        const reachable = seed.reachablePaths.map((path) =>
          prefixPath(`${MODULE_GRAPH_COMPONENT_NAMESPACE}-${index}`, path)
        );
        edges.push(...componentEdges(entryPath, reachable, seed.parentPicks));
        if (seed.withRedundantEdge) {
          edges.push({ importerPath: entryPath, importedPath: reachable[reachable.length - 1] });
        }
        expectedPairs.push(...reachable.map((sourcePath): ProviderFactPair => [entryPath, sourcePath]));
      });
      const noisePaths = noise.noisePaths.map((path) => prefixPath(MODULE_GRAPH_NOISE_NAMESPACE, path));
      noisePaths.slice(1).forEach((next, index) => {
        edges.push({ importerPath: noisePaths[index], importedPath: next });
      });
      if (noise.linkNoiseToFirstEntry && noisePaths.length > 0) {
        edges.push({ importerPath: noisePaths[0], importedPath: entries[0] });
      }
      return { input: { testEntryPaths: entries, edges }, expectedPairs };
    });
}

/** One coverage scenario and one module-graph scenario for cross-descriptor rules. */
export interface TypescriptProviderScenarioPair {
  readonly coverage: TypescriptCoverageScenario;
  readonly moduleGraph: TypescriptModuleGraphScenario;
}

/** A pair of payloads exercising both TypeScript descriptors in one property case. */
export function arbitraryTypescriptProviderScenarioPair(): fc.Arbitrary<TypescriptProviderScenarioPair> {
  return fc.record({
    coverage: arbitraryTypescriptCoverageScenario(),
    moduleGraph: arbitraryTypescriptModuleGraphScenario(),
  }).map((pair) => ({ coverage: pair.coverage, moduleGraph: pair.moduleGraph }));
}
