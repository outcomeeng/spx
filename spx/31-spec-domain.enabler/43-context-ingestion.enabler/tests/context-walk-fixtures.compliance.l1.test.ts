import { basename, dirname } from "node:path";

import { describe, expect, it } from "vitest";

import { SPEC_TREE_CONFIG, SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  arbitraryContextWalkSlugs,
  compareWalkKeys,
  CONTEXT_WALK,
  CONTEXT_WALK_DECLARATION,
  CONTEXT_WALK_ROLE,
  contextWalkCitations,
  type ContextWalkFixture,
  contextWalkFixtures,
  leadingIndex,
  segmentsOf,
  walkKey,
} from "@testing/generators/spec-tree/context-walk";

type RoleName = keyof typeof CONTEXT_WALK_ROLE;

const fixtures = contextWalkFixtures(sampleGeneratedValue(arbitraryContextWalkSlugs()));
const cases = fixtures.map((fixture) => [fixture.declaration, fixture] as const);

function role(fixture: ContextWalkFixture, name: RoleName): string {
  return fixture.roles[CONTEXT_WALK_ROLE[name]];
}

function directoryIndex(path: string): number {
  return leadingIndex(basename(dirname(path)));
}

function fileIndex(path: string): number {
  return leadingIndex(basename(path));
}

function expectAll(readSet: readonly string[], fixture: ContextWalkFixture, names: readonly RoleName[]): void {
  for (const name of names) expect(readSet, name).toContain(role(fixture, name));
}

function expectNone(readSet: readonly string[], fixture: ContextWalkFixture, names: readonly RoleName[]): void {
  for (const name of names) expect(readSet, name).not.toContain(role(fixture, name));
}

function expectLevels(fixture: ContextWalkFixture): void {
  const target = role(fixture, "TARGET");
  const targetDirectory = dirname(target);
  const pathChildIndex = directoryIndex(role(fixture, "PATH_NODE"));
  const targetIndex = leadingIndex(basename(targetDirectory));
  expect(segmentsOf(target).length - 1).toBeGreaterThanOrEqual(2);
  expect(fixture.probes.every((probe) => probe.target.startsWith(dirname(role(fixture, "PATH_NODE_ISSUES"))))).toBe(
    true,
  );
  expect(fileIndex(role(fixture, "ROOT_DECISION_BELOW"))).toBeLessThan(pathChildIndex);
  expect(fileIndex(role(fixture, "ROOT_DECISION_ABOVE"))).toBeGreaterThan(pathChildIndex);
  expect(fileIndex(role(fixture, "PATH_DECISION_BELOW"))).toBeLessThan(targetIndex);
  expect(fileIndex(role(fixture, "PATH_DECISION_ABOVE"))).toBeGreaterThan(targetIndex);
  expect(dirname(role(fixture, "TARGET_DECISION"))).toBe(targetDirectory);
  expect(dirname(dirname(role(fixture, "TARGET_CHILD")))).toBe(targetDirectory);
  expect(dirname(role(fixture, "PRODUCT"))).toBe(SPEC_TREE_CONFIG.ROOT_DIRECTORY);
}

function expectKnowledgeAndCitations(fixture: ContextWalkFixture): void {
  const files = Object.keys(fixture.files);
  const targetDirectory = dirname(role(fixture, "TARGET"));
  expect(role(fixture, "TARGET_KNOWLEDGE_INDEX")).toBe(
    [targetDirectory, SPEC_TREE_GRAMMAR.KNOWLEDGE.DIRECTORY_NAME, SPEC_TREE_GRAMMAR.KNOWLEDGE.INDEX_FILENAME].join(
      SPEC_TREE_GRAMMAR.PATH_SEPARATOR,
    ),
  );
  expect(dirname(role(fixture, "TARGET_KNOWLEDGE_BODY"))).toBe(dirname(role(fixture, "TARGET_KNOWLEDGE_INDEX")));
  expect(files).toContain(role(fixture, "TARGET_KNOWLEDGE_BODY"));
  const cited = contextWalkCitations(fixture.files[role(fixture, "TARGET")] ?? "");
  expect(cited).toContain(role(fixture, "CITED_DECISION"));
  expect(cited).toContain(role(fixture, "UNRESOLVED_CITATION"));
  expect(files).toContain(role(fixture, "CITED_DECISION"));
  expect(files).not.toContain(role(fixture, "UNRESOLVED_CITATION"));
  expect(dirname(dirname(role(fixture, "OUTCOME_SIBLING_RECORD")))).toBe(dirname(targetDirectory));
  expect(files).toContain(role(fixture, "OUTCOME_SIBLING_RECORD"));
  expect(role(fixture, "OUTCOME_SIBLING_RECORD").endsWith(SPEC_TREE_GRAMMAR.OUTCOME_RECORD.SUFFIX)).toBe(true);
}

function expectThreeTwoSiblings(fixture: ContextWalkFixture): void {
  const targetIndex = directoryIndex(role(fixture, "TARGET"));
  expect(directoryIndex(role(fixture, "LOWER_SIBLING"))).toBeLessThan(targetIndex);
  expect(directoryIndex(role(fixture, "SAME_INDEX_SIBLING"))).toBe(targetIndex);
  expect(directoryIndex(role(fixture, "HIGHER_INDEX_SIBLING"))).toBeGreaterThan(targetIndex);
  expect(Object.keys(fixture.files)).toContain(role(fixture, "SAME_INDEX_SIBLING"));
  expect(Object.keys(fixture.files)).toContain(role(fixture, "HIGHER_INDEX_SIBLING"));
}

function expectThreeTwoReadSet(fixture: ContextWalkFixture, readSet: readonly string[]): void {
  expectAll(readSet, fixture, [
    "ROOT_DECISION_BELOW",
    "ROOT_DECISION_ABOVE",
    "PATH_DECISION_BELOW",
    "PATH_DECISION_ABOVE",
    "LOWER_SIBLING",
  ]);
  expectNone(readSet, fixture, ["SAME_INDEX_SIBLING", "HIGHER_INDEX_SIBLING", "TARGET_CHILD", "ROOT_SIBLING"]);
  expect(readSet.indexOf(role(fixture, "PRODUCT"))).toBe(0);
  expect(readSet.indexOf(role(fixture, "PATH_NODE"))).toBeLessThan(readSet.indexOf(role(fixture, "TARGET")));
  expect(readSet.at(-1)).toBe(role(fixture, "CITED_DECISION"));
}

function expectFourZeroReadSet(fixture: ContextWalkFixture, readSet: readonly string[]): void {
  expectNone(readSet, fixture, ["ROOT_DECISION_ABOVE", "PATH_DECISION_ABOVE"]);
  expectAll(readSet, fixture, [
    "ROOT_DECISION_BELOW",
    "PATH_DECISION_BELOW",
    "TARGET_DECISION",
    "TARGET_CHILD",
    "LOWER_SIBLING",
    "ROOT_SIBLING",
    "PATH_NODE_ISSUES",
    "TARGET_KNOWLEDGE_INDEX",
  ]);
  const treeEntries = readSet.slice(0, -1);
  expect(readSet.at(-1)).toBe(role(fixture, "CITED_DECISION"));
  expect(treeEntries).toEqual([...treeEntries].sort((a, b) => compareWalkKeys(walkKey(a), walkKey(b))));
}

describe("context-walk fixture products", () => {
  it("covers the 3.2, 4.0, and 4.0 migrating declarations, each with its configured methodology and walk", () => {
    expect(fixtures.map((fixture) => fixture.declaration)).toEqual(Object.values(CONTEXT_WALK_DECLARATION));
    for (const fixture of fixtures) {
      expect(fixture.walk).toBe(
        fixture.declaration === CONTEXT_WALK_DECLARATION.THREE_TWO ? CONTEXT_WALK.THREE_TWO : CONTEXT_WALK.FOUR_ZERO,
      );
      expect(fixture.methodology.migratingFrom !== undefined).toBe(
        fixture.declaration === CONTEXT_WALK_DECLARATION.FOUR_ZERO_MIGRATING,
      );
    }
  });

  it.each(cases)("%s holds every walk item its declaration requires", (_declaration, fixture) => {
    expectLevels(fixture);
    expectKnowledgeAndCitations(fixture);
    if (fixture.declaration === CONTEXT_WALK_DECLARATION.THREE_TWO) expectThreeTwoSiblings(fixture);
  });

  it.each(cases)(
    "%s records, per probed target, the read set its declared walk computes, in walk order",
    (_declaration, fixture) => {
      expect(fixture.probes.length).toBeGreaterThan(0);
      for (const probe of fixture.probes) {
        const { readSet } = probe;
        expect(new Set(readSet).size).toBe(readSet.length);
        for (const path of readSet) expect(Object.keys(fixture.files)).toContain(path);
        for (const path of probe.unresolved) expect(readSet).not.toContain(path);
        expectAll(readSet, fixture, ["TARGET", "CITED_DECISION"]);
        expectNone(readSet, fixture, ["TARGET_KNOWLEDGE_BODY", "OUTCOME_SIBLING_RECORD"]);
        if (fixture.walk === CONTEXT_WALK.THREE_TWO) expectThreeTwoReadSet(fixture, readSet);
        else expectFourZeroReadSet(fixture, readSet);
      }
    },
  );
});
