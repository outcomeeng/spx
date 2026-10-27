/**
 * Generators for nested-product layouts: a chain of directory levels from the invocation directory
 * up to the repository root, each optionally holding a product configuration file and a product
 * spec. Every layout records the local product root a resolver must reach from the invocation
 * directory, so a test asserts the resolver against the layout's own declaration.
 *
 * @module generators/state/nested-product-layout
 */

import { posix } from "node:path";

import * as fc from "fast-check";

import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";

/** Relative path of the repository-root level. */
export const REPOSITORY_ROOT_RELATIVE_PATH = ".";

/** Prefixes that make a placed level's title and configuration value derive from its unique token. */
export const NESTED_LAYOUT_TITLE_PREFIX = "Product ";
export const NESTED_LAYOUT_CONFIG_VALUE_PREFIX = "config-";

const MIN_LEVELS = 1;
const MAX_LEVELS = 4;
const MIN_LEVELS_WITH_DISTINCT_ENDS = 2;

/** The title and configuration value a level carries when it holds `spx.config.*` and a product spec. */
export interface PlacedProductLevel {
  readonly title: string;
  readonly configValue: string;
}

/** One directory level of a layout; `placed` is null when the level holds neither file. */
export interface NestedProductLevel {
  readonly relativePath: string;
  readonly placed: PlacedProductLevel | null;
}

/**
 * A generated nested-product layout. `levels` runs from the invocation level first to the
 * repository-root level last; `relativePath` values are relative to the repository root.
 */
export interface NestedProductLayout {
  readonly insideRepository: boolean;
  readonly levels: readonly [NestedProductLevel, ...NestedProductLevel[]];
  readonly invocationPath: string;
  readonly declaredLocalProductRoot: string;
}

interface LayoutDraw {
  readonly insideRepository: boolean;
  readonly segments: readonly string[];
  readonly placedFlags: readonly boolean[];
  readonly tokens: readonly string[];
}

function arbitraryLayoutDraw(minLevels: number): fc.Arbitrary<LayoutDraw> {
  return fc.record({
    insideRepository: fc.boolean(),
    segments: fc.uniqueArray(arbitraryPathSegment(), { minLength: minLevels - 1, maxLength: MAX_LEVELS - 1 }),
    placedFlags: fc.array(fc.boolean(), { minLength: MAX_LEVELS, maxLength: MAX_LEVELS }),
    tokens: fc.uniqueArray(arbitraryPathSegment(), { minLength: MAX_LEVELS, maxLength: MAX_LEVELS }),
  });
}

function relativePathsInvocationFirst(segments: readonly string[]): string[] {
  const paths = [REPOSITORY_ROOT_RELATIVE_PATH];
  for (const [index] of segments.entries()) {
    paths.push(posix.join(...segments.slice(0, index + 1)));
  }
  return paths.reverse();
}

function declaredRoot(
  insideRepository: boolean,
  levels: readonly NestedProductLevel[],
): string {
  if (!insideRepository) return levels[0].relativePath;
  const nearestPlaced = levels.find((level) => level.placed !== null);
  return (nearestPlaced ?? levels[levels.length - 1]).relativePath;
}

function buildLayout(draw: LayoutDraw, placeBothEnds: boolean): NestedProductLayout {
  const paths = relativePathsInvocationFirst(draw.segments);
  const lastIndex = paths.length - 1;
  const levels = paths.map((relativePath, index): NestedProductLevel => {
    const isPlaced = placeBothEnds ? index === 0 || index === lastIndex : draw.placedFlags[index];
    const token = draw.tokens[index];
    return {
      relativePath,
      placed: isPlaced
        ? {
          title: `${NESTED_LAYOUT_TITLE_PREFIX}${token}`,
          configValue: `${NESTED_LAYOUT_CONFIG_VALUE_PREFIX}${token}`,
        }
        : null,
    };
  }) as unknown as [NestedProductLevel, ...NestedProductLevel[]];
  const insideRepository = placeBothEnds ? true : draw.insideRepository;
  return {
    insideRepository,
    levels,
    invocationPath: levels[0].relativePath,
    declaredLocalProductRoot: declaredRoot(insideRepository, levels),
  };
}

/** A nested-product layout of one to four levels, inside or outside a repository, with any placement pattern. */
export function arbitraryNestedProductLayout(): fc.Arbitrary<NestedProductLayout> {
  return arbitraryLayoutDraw(MIN_LEVELS).map((draw) => buildLayout(draw, false));
}

/** A layout inside a repository with a placed `spx.config.*` and product spec at both the invocation level and the repository root. */
export function arbitraryLayoutWithConfigAtInvocationAndRoot(): fc.Arbitrary<NestedProductLayout> {
  return arbitraryLayoutDraw(MIN_LEVELS_WITH_DISTINCT_ENDS).map((draw) => buildLayout(draw, true));
}
