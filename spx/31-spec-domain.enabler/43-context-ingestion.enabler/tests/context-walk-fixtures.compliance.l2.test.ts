import { describe, expect, it } from "vitest";

import { KIND_REGISTRY, SPEC_TREE_CONFIG, SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";
import {
  CONTEXT_WALK,
  CONTEXT_WALK_ARTIFACT_RANK,
  CONTEXT_WALK_EVIDENCE_DIRECTORY,
  CONTEXT_WALK_FIXTURES,
  CONTEXT_WALK_ISSUES,
  CONTEXT_WALK_KNOWLEDGE,
  CONTEXT_WALK_MODE,
  CONTEXT_WALK_ORDER_SEPARATOR,
  CONTEXT_WALK_OUTCOME_SUFFIX,
  CONTEXT_WALK_ROLE,
  CONTEXT_WALK_SEPARATOR,
  CONTEXT_WALK_SPEC_SUFFIXES,
  contextWalkCases,
  contextWalkDeclaration,
  type ContextWalkEntry,
  type ContextWalkFixtureProduct,
  contextWalkLinks,
  contextWalkProductFiles,
  type ContextWalkRole,
} from "@testing/harnesses/spec-tree/context-walk-fixtures";

interface Item {
  readonly path: string;
  readonly role: ContextWalkRole;
  readonly level: number;
  readonly belowChild: boolean;
}

function segmentsOf(path: string): string[] {
  return path.split(CONTEXT_WALK_SEPARATOR).slice(1);
}

function indexOf(segment: string): number {
  return Number.parseInt(segment.split(CONTEXT_WALK_ORDER_SEPARATOR)[0], 10);
}

function slugOf(directory: string): string {
  return directory.slice(directory.indexOf(CONTEXT_WALK_ORDER_SEPARATOR) + 1, directory.lastIndexOf("."));
}

function isDecision(name: string): boolean {
  return [KIND_REGISTRY.adr.suffix, KIND_REGISTRY.pdr.suffix].some((suffix) => name.endsWith(suffix));
}

function isSpecOf(directories: readonly string[], name: string): boolean {
  if (directories.length === 0) {
    return name.endsWith(SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX)
      || name.endsWith(SPEC_TREE_CONFIG.PRODUCT.SUFFIX);
  }
  const slug = slugOf(directories[directories.length - 1]);
  return CONTEXT_WALK_SPEC_SUFFIXES.some((suffix) => name === `${slug}${suffix}`);
}

function startsWith(directories: readonly string[], prefix: readonly string[]): boolean {
  return prefix.every((segment, position) => directories[position] === segment);
}

function item(path: string, role: ContextWalkRole, level: number, belowChild = true): Item {
  return { path, role, level, belowChild };
}

function classifyOnPath(file: string, target: readonly string[]): Item | undefined {
  const segments = segmentsOf(file);
  const name = segments[segments.length - 1];
  const directories = segments.slice(0, -1);
  const depth = directories.length;
  if (depth > target.length || !startsWith(target, directories)) return undefined;
  if (isSpecOf(directories, name)) return item(file, CONTEXT_WALK_ROLE.SPEC, depth);
  if (isDecision(name)) {
    const belowChild = depth === target.length || indexOf(name) < indexOf(target[depth]);
    return item(file, CONTEXT_WALK_ROLE.DECISION, depth, belowChild);
  }
  return name === CONTEXT_WALK_ISSUES ? item(file, CONTEXT_WALK_ROLE.ISSUES, depth) : undefined;
}

function classifySibling(file: string, target: readonly string[]): Item | undefined {
  const segments = segmentsOf(file);
  const directories = segments.slice(0, -1);
  const parent = directories.length - 1;
  if (parent < 0 || parent >= target.length || !startsWith(directories, target.slice(0, parent))) return undefined;
  if (directories[parent] === target[parent] || !isSpecOf(directories, segments[segments.length - 1])) {
    return undefined;
  }
  const order = indexOf(directories[parent]) - indexOf(target[parent]);
  const role = order < 0 ? CONTEXT_WALK_ROLE.LOWER : order === 0 ? CONTEXT_WALK_ROLE.PEER : CONTEXT_WALK_ROLE.HIGHER;
  return item(file, role, parent);
}

function classifyBelowTarget(file: string, target: readonly string[]): Item | undefined {
  const segments = segmentsOf(file);
  const name = segments[segments.length - 1];
  const directories = segments.slice(0, -1);
  if (directories.length !== target.length + 1 || !startsWith(directories, target)) return undefined;
  if (isSpecOf(directories, name)) return item(file, CONTEXT_WALK_ROLE.CHILD, target.length);
  const isIndex = directories[target.length] === CONTEXT_WALK_KNOWLEDGE.DIRECTORY_NAME
    && name === CONTEXT_WALK_KNOWLEDGE.INDEX_FILENAME;
  return isIndex ? item(file, CONTEXT_WALK_ROLE.KNOWLEDGE_INDEX, target.length) : undefined;
}

function classified(files: readonly string[], target: readonly string[]): Item[] {
  return files.flatMap((file) =>
    classifyOnPath(file, target) ?? classifySibling(file, target) ?? classifyBelowTarget(file, target) ?? []
  );
}

function citations(product: ContextWalkFixtureProduct, items: readonly Item[], depth: number): string[] {
  const spec = items.find((candidate) => candidate.role === CONTEXT_WALK_ROLE.SPEC && candidate.level === depth);
  return spec === undefined ? [] : contextWalkLinks(product, spec.path).filter((link) => isDecision(link));
}

function walkItems(product: ContextWalkFixtureProduct, files: readonly string[], target: readonly string[]): Item[] {
  const items = classified(files, target);
  if (product.walk === CONTEXT_WALK.THREE_TWO) {
    const roles: readonly ContextWalkRole[] = [
      CONTEXT_WALK_ROLE.SPEC,
      CONTEXT_WALK_ROLE.LOWER,
      CONTEXT_WALK_ROLE.DECISION,
    ];
    return items.filter((candidate) => roles.includes(candidate.role));
  }
  const selected = items.filter((candidate) => candidate.role !== CONTEXT_WALK_ROLE.DECISION || candidate.belowChild);
  const cited = citations(product, items, target.length)
    .filter((link) => files.includes(link) && !selected.some((chosen) => chosen.path === link))
    .map((link) => item(link, CONTEXT_WALK_ROLE.CITED, 0));
  return [...selected, ...cited];
}

function treeKey(path: string): Array<readonly [number, string]> {
  const segments = segmentsOf(path);
  return segments.map((segment, position): readonly [number, string] => {
    if (segment === CONTEXT_WALK_KNOWLEDGE.DIRECTORY_NAME) return [CONTEXT_WALK_ARTIFACT_RANK.KNOWLEDGE, segment];
    if (isDecision(segment) || position < segments.length - 1) return [indexOf(segment), segment];
    if (segment === CONTEXT_WALK_ISSUES) return [CONTEXT_WALK_ARTIFACT_RANK.ISSUES, segment];
    if (segment.endsWith(CONTEXT_WALK_OUTCOME_SUFFIX)) return [CONTEXT_WALK_ARTIFACT_RANK.OUTCOME, segment];
    return [CONTEXT_WALK_ARTIFACT_RANK.SPEC, segment];
  });
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareTree(left: Item, right: Item): number {
  const a = treeKey(left.path);
  const b = treeKey(right.path);
  const shared = Math.min(a.length, b.length);
  for (let position = 0; position < shared; position += 1) {
    const difference = a[position][0] - b[position][0] || compareText(a[position][1], b[position][1]);
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
}

function threeTwoRank(candidate: Item, depth: number): number {
  const atTarget = candidate.level === depth;
  if (candidate.role === CONTEXT_WALK_ROLE.DECISION) return atTarget ? 0 : 1;
  if (candidate.role === CONTEXT_WALK_ROLE.SPEC) return atTarget ? 1 : 0;
  return 2;
}

function compareThreeTwo(depth: number): (left: Item, right: Item) => number {
  return (left, right) =>
    left.level - right.level
    || threeTwoRank(left, depth) - threeTwoRank(right, depth)
    || compareText(left.path, right.path);
}

function modeOf(product: ContextWalkFixtureProduct, role: ContextWalkRole): string {
  if (product.walk === CONTEXT_WALK.THREE_TWO) return CONTEXT_WALK_MODE.FULL;
  const digests: readonly ContextWalkRole[] = [
    CONTEXT_WALK_ROLE.LOWER,
    CONTEXT_WALK_ROLE.PEER,
    CONTEXT_WALK_ROLE.HIGHER,
    CONTEXT_WALK_ROLE.CHILD,
  ];
  const references: readonly ContextWalkRole[] = [CONTEXT_WALK_ROLE.ISSUES, CONTEXT_WALK_ROLE.KNOWLEDGE_INDEX];
  if (digests.includes(role)) return CONTEXT_WALK_MODE.DIGEST;
  return references.includes(role) ? CONTEXT_WALK_MODE.REFERENCE : CONTEXT_WALK_MODE.FULL;
}

function expectedReadSet(
  product: ContextWalkFixtureProduct,
  files: readonly string[],
  target: readonly string[],
): ContextWalkEntry[] {
  const compare = product.walk === CONTEXT_WALK.THREE_TWO ? compareThreeTwo(target.length) : compareTree;
  return walkItems(product, files, target)
    .sort(compare)
    .map((selected) => ({ path: selected.path, mode: modeOf(product, selected.role) }));
}

/** The first way a recorded read set departs from the walk's items, or undefined when it equals them. */
function readSetDefect(
  product: ContextWalkFixtureProduct,
  target: string,
  files: readonly string[],
  recorded: readonly ContextWalkEntry[],
): string | undefined {
  const expected = expectedReadSet(product, files, segmentsOf(target));
  const recordedPaths = recorded.map((entry) => entry.path);
  const expectedPaths = expected.map((entry) => entry.path);
  const where = `${product.name} ${target}`;
  const absent = recordedPaths.find((path) => !files.includes(path));
  if (absent !== undefined) return `${where}: entry absent from the fixture: ${absent}`;
  const extra = recordedPaths.find((path) => !expectedPaths.includes(path));
  if (extra !== undefined) return `${where}: extra entry outside the walk: ${extra}`;
  const missing = expectedPaths.find((path) => !recordedPaths.includes(path));
  if (missing !== undefined) return `${where}: missing walk item: ${missing}`;
  const differing = expected.findIndex((entry, position) =>
    entry.path !== recorded[position].path || entry.mode !== recorded[position].mode
  );
  if (differing < 0) return undefined;
  const found = recorded[differing];
  return `${where}: entry ${differing} holds ${found.path} (${found.mode}), the walk has ${expected[differing].path} (${
    expected[differing].mode
  })`;
}

function knowledgeBody(files: readonly string[], target: string): string | undefined {
  const directory =
    `${target}${CONTEXT_WALK_SEPARATOR}${CONTEXT_WALK_KNOWLEDGE.DIRECTORY_NAME}${CONTEXT_WALK_SEPARATOR}`;
  return files.find((file) => file.startsWith(directory) && !file.endsWith(CONTEXT_WALK_KNOWLEDGE.INDEX_FILENAME));
}

function holdsSiblingOutcomeRecord(files: readonly string[], target: readonly string[]): boolean {
  return files.some((file) => {
    const directories = segmentsOf(file).slice(0, -1);
    return file.endsWith(CONTEXT_WALK_OUTCOME_SUFFIX)
      && directories.length === target.length
      && startsWith(directories.slice(0, -1), target.slice(0, -1))
      && directories[directories.length - 1] !== target[target.length - 1];
  });
}

function expectDecisionsAroundPathChild(items: readonly Item[], depth: number): void {
  const decisions = items.filter((candidate) => candidate.role === CONTEXT_WALK_ROLE.DECISION);
  const onPath = decisions.filter((candidate) => candidate.level < depth);
  expect(onPath.some((candidate) => candidate.belowChild)).toBe(true);
  expect(onPath.some((candidate) => !candidate.belowChild)).toBe(true);
  expect(decisions.some((candidate) => candidate.level === depth)).toBe(true);
}

function expectLevelsAndNotes(product: ContextWalkFixtureProduct, target: string): void {
  const files = contextWalkProductFiles(product);
  const segments = segmentsOf(target);
  const items = classified(files, segments);
  const rolesHeld = (role: ContextWalkRole) => items.filter((candidate) => candidate.role === role);
  expect(segments.length).toBeGreaterThanOrEqual(2);
  expect(rolesHeld(CONTEXT_WALK_ROLE.ISSUES).length).toBeGreaterThan(0);
  expect(rolesHeld(CONTEXT_WALK_ROLE.CHILD).length).toBeGreaterThan(0);
  expect(rolesHeld(CONTEXT_WALK_ROLE.KNOWLEDGE_INDEX)).toHaveLength(1);
  expectDecisionsAroundPathChild(items, segments.length);
  expect(knowledgeBody(files, target)).toBeDefined();
  expect(
    files.some((file) =>
      file.includes(`${CONTEXT_WALK_SEPARATOR}${CONTEXT_WALK_EVIDENCE_DIRECTORY}${CONTEXT_WALK_SEPARATOR}`)
    ),
  ).toBe(true);
}

function expectCitationsAndSiblings(product: ContextWalkFixtureProduct, target: string): void {
  const files = contextWalkProductFiles(product);
  const segments = segmentsOf(target);
  const items = classified(files, segments);
  const links = citations(product, items, segments.length);
  expect(links.some((link) => files.includes(link))).toBe(true);
  expect(links.some((link) => !files.includes(link))).toBe(true);
  expect(holdsSiblingOutcomeRecord(files, segments)).toBe(true);
  for (const role of [CONTEXT_WALK_ROLE.LOWER, CONTEXT_WALK_ROLE.PEER, CONTEXT_WALK_ROLE.HIGHER]) {
    expect(items.some((candidate) => candidate.role === role && candidate.level === segments.length - 1)).toBe(true);
  }
}

function expectDefectNames(
  defect: string | undefined,
  product: ContextWalkFixtureProduct,
  target: string,
  finding: string,
): void {
  expect(defect).toContain(product.name);
  expect(defect).toContain(target);
  expect(defect).toContain(finding);
}

describe("context-walk fixture products", () => {
  it.each(CONTEXT_WALK_FIXTURES)("$name declares its methodology line and migration", (product) => {
    const declaration = contextWalkDeclaration(product);
    expect(declaration.version.startsWith(product.versionLine)).toBe(true);
    expect(declaration.migratingFrom !== undefined).toBe(product.migrating);
  });

  it.each(contextWalkCases())("$product.name holds every walk item for $target", ({ product, target }) => {
    expectLevelsAndNotes(product, target);
    expectCitationsAndSiblings(product, target);
  });

  it.each(contextWalkCases())(
    "$product.name records exactly the walk's read set for $target",
    ({ product, target, recorded }) => {
      expect(readSetDefect(product, target, contextWalkProductFiles(product), recorded)).toBeUndefined();
    },
  );

  describe("rejects a recorded read set that departs from the walk", () => {
    it.each(contextWalkCases())(
      "$product.name: omits the target's own decision records for $target",
      ({ product, target, recorded }) => {
        const files = contextWalkProductFiles(product);
        const depth = segmentsOf(target).length;
        const own = classified(files, segmentsOf(target)).filter((candidate) =>
          candidate.role === CONTEXT_WALK_ROLE.DECISION && candidate.level === depth
        );
        expect(own.length).toBeGreaterThan(0);
        const defect = readSetDefect(product, target, files, recorded.filter((entry) => entry.path !== own[0].path));
        expectDefectNames(defect, product, target, `missing walk item: ${own[0].path}`);
      },
    );

    it.each(contextWalkCases())(
      "$product.name: lists the knowledge body for $target",
      ({ product, target, recorded }) => {
        const files = contextWalkProductFiles(product);
        const body = knowledgeBody(files, target) as string;
        const defect = readSetDefect(product, target, files, [...recorded, {
          path: body,
          mode: CONTEXT_WALK_MODE.FULL,
        }]);
        expectDefectNames(defect, product, target, `extra entry outside the walk: ${body}`);
      },
    );

    it.each(contextWalkCases().filter(({ product }) => product.walk === CONTEXT_WALK.THREE_TWO))(
      "$product.name: reads a same- or higher-index sibling for $target",
      ({ product, target, recorded }) => {
        const files = contextWalkProductFiles(product);
        const departures = classified(files, segmentsOf(target)).filter((candidate) =>
          candidate.role === CONTEXT_WALK_ROLE.PEER || candidate.role === CONTEXT_WALK_ROLE.HIGHER
        );
        expect(departures.length).toBeGreaterThan(0);
        for (const departure of departures) {
          const read = [...recorded, { path: departure.path, mode: CONTEXT_WALK_MODE.FULL }];
          expectDefectNames(
            readSetDefect(product, target, files, read),
            product,
            target,
            `extra entry outside the walk: ${departure.path}`,
          );
        }
      },
    );

    it.each(contextWalkCases().filter(({ product }) => product.walk === CONTEXT_WALK.THREE_TWO))(
      "$product.name: cuts a decision above the path child for $target",
      ({ product, target, recorded }) => {
        const files = contextWalkProductFiles(product);
        const cut = classified(files, segmentsOf(target)).filter((candidate) =>
          candidate.role === CONTEXT_WALK_ROLE.DECISION && !candidate.belowChild
        );
        expect(cut.length).toBeGreaterThan(0);
        for (const decision of cut) {
          const read = recorded.filter((entry) => entry.path !== decision.path);
          expectDefectNames(
            readSetDefect(product, target, files, read),
            product,
            target,
            `missing walk item: ${decision.path}`,
          );
        }
      },
    );
  });
});
