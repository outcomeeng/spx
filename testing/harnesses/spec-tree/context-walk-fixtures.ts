/**
 * Harness for reading the inert context-walk fixture products from disk.
 *
 * Locates the three fixture products under `testing/fixtures/spec-tree/context-walk/` and
 * returns what they hold: the product's file paths, its methodology declaration, the read
 * sets recorded beside its `spx/` tree, and the content of one file. The harness builds no
 * fixture and computes no read set; the linked test states the walk each declaration
 * selects and compares the recorded sets with it.
 *
 * @module harnesses/spec-tree/context-walk-fixtures
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { parse } from "yaml";

import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION } from "@/config/methodology";
import {
  SPEC_CONTEXT_MODE,
  SPEC_CONTEXT_MODE_NAME,
  SPEC_CONTEXT_OPTIONAL_ARTIFACT,
  SPEC_TREE_CONFIG,
  SPEC_TREE_GRAMMAR,
} from "@/lib/spec-tree";

/** The walk a fixture's methodology declaration selects. */
export const CONTEXT_WALK = { THREE_TWO: "three-two", FOUR_ZERO: "four-zero" } as const;

export type ContextWalk = (typeof CONTEXT_WALK)[keyof typeof CONTEXT_WALK];

export const CONTEXT_WALK_MODE = {
  FULL: SPEC_CONTEXT_MODE_NAME[SPEC_CONTEXT_MODE.FULL],
  DIGEST: SPEC_CONTEXT_MODE_NAME[SPEC_CONTEXT_MODE.DIGEST],
  REFERENCE: SPEC_CONTEXT_MODE_NAME[SPEC_CONTEXT_MODE.REFERENCE],
} as const;

/** The roles a fixture path plays relative to a probed target. */
export const CONTEXT_WALK_ROLE = {
  SPEC: "spec",
  DECISION: "decision",
  ISSUES: "issues",
  LOWER: "lower",
  PEER: "peer",
  HIGHER: "higher",
  CHILD: "child",
  KNOWLEDGE_INDEX: "knowledge-index",
  CITED: "cited",
} as const;

export type ContextWalkRole = (typeof CONTEXT_WALK_ROLE)[keyof typeof CONTEXT_WALK_ROLE];

/** Where an artifact a directory holds sorts before the directory's decisions and child nodes. */
export const CONTEXT_WALK_ARTIFACT_RANK = { SPEC: -4, ISSUES: -3, OUTCOME: -2, KNOWLEDGE: -1 } as const;

export interface ContextWalkFixtureProduct {
  readonly name: string;
  readonly walk: ContextWalk;
  readonly versionLine: string;
  readonly migrating: boolean;
}

export const CONTEXT_WALK_FIXTURES: readonly ContextWalkFixtureProduct[] = [
  { name: "three-two", walk: CONTEXT_WALK.THREE_TWO, versionLine: "3.2", migrating: false },
  { name: "four-zero", walk: CONTEXT_WALK.FOUR_ZERO, versionLine: "4.0", migrating: false },
  { name: "four-zero-migrating", walk: CONTEXT_WALK.FOUR_ZERO, versionLine: "4.0", migrating: true },
];

/** One entry of a recorded read set: a path relative to the fixture product root and a projection mode. */
export interface ContextWalkEntry {
  readonly path: string;
  readonly mode: string;
}

export interface ContextWalkDeclaration {
  readonly version: string;
  readonly migratingFrom?: string;
}

const FIXTURE_ROOT = resolve(__dirname, "../../fixtures/spec-tree/context-walk");
const READ_SETS_FILE = "read-sets.json";
const CONFIG_FILE = "spx.config.yaml";
const INLINE_LINK = /\]\(([^)]+)\)/g;

export const CONTEXT_WALK_SEPARATOR = SPEC_TREE_GRAMMAR.PATH_SEPARATOR;
export const CONTEXT_WALK_ISSUES = SPEC_CONTEXT_OPTIONAL_ARTIFACT.ISSUES;
export const CONTEXT_WALK_OUTCOME_SUFFIX = SPEC_CONTEXT_OPTIONAL_ARTIFACT.OUTCOME_SUFFIX;
export const CONTEXT_WALK_KNOWLEDGE = SPEC_TREE_GRAMMAR.KNOWLEDGE;
export const CONTEXT_WALK_EVIDENCE_DIRECTORY = SPEC_TREE_GRAMMAR.EVIDENCE.DIRECTORY_NAME;

function listFiles(directory: string, prefix: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const relative = `${prefix}${CONTEXT_WALK_SEPARATOR}${name}`;
    const absolute = join(directory, name);
    return statSync(absolute).isDirectory() ? listFiles(absolute, relative) : [relative];
  });
}

/** Every file under the product's `spx/` tree, as a path relative to the product root. */
export function contextWalkProductFiles(product: ContextWalkFixtureProduct): string[] {
  const root = SPEC_TREE_CONFIG.ROOT_DIRECTORY;
  return listFiles(join(FIXTURE_ROOT, product.name, root), root);
}

/** The read sets recorded beside the product's `spx/` tree, keyed by probed target. */
export function contextWalkReadSets(product: ContextWalkFixtureProduct): Record<string, ContextWalkEntry[]> {
  return JSON.parse(readFileSync(join(FIXTURE_ROOT, product.name, READ_SETS_FILE), "utf8"));
}

/** The methodology declaration the product's configuration carries. */
export function contextWalkDeclaration(product: ContextWalkFixtureProduct): ContextWalkDeclaration {
  const config = parse(readFileSync(join(FIXTURE_ROOT, product.name, CONFIG_FILE), "utf8"));
  const methodology = config[METHODOLOGY_SECTION];
  return {
    version: String(methodology[METHODOLOGY_CONFIG_FIELDS.VERSION]),
    migratingFrom: methodology[METHODOLOGY_CONFIG_FIELDS.MIGRATING_FROM],
  };
}

/** The targets of the Markdown inline links the product file at `path` carries. */
export function contextWalkLinks(product: ContextWalkFixtureProduct, path: string): string[] {
  const content = readFileSync(join(FIXTURE_ROOT, product.name, path), "utf8");
  return [...content.matchAll(INLINE_LINK)].map((match) => match[1]);
}

export const CONTEXT_WALK_ORDER_SEPARATOR = SPEC_TREE_GRAMMAR.ORDER.SEPARATOR;
export const CONTEXT_WALK_SPEC_SUFFIXES = [
  SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX,
  SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX,
];

export interface ContextWalkCase {
  readonly product: ContextWalkFixtureProduct;
  readonly target: string;
  readonly recorded: ContextWalkEntry[];
}

/** One case per fixture product and probed target, with the read set recorded for it. */
export function contextWalkCases(): ContextWalkCase[] {
  return CONTEXT_WALK_FIXTURES.flatMap((product) =>
    Object.entries(contextWalkReadSets(product)).map(([target, recorded]) => ({ product, target, recorded }))
  );
}
