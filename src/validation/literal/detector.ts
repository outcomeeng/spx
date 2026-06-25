import { parse as parseTypeScript } from "@typescript-eslint/parser";
import { visitorKeys as typescriptVisitorKeys } from "@typescript-eslint/visitor-keys";

import { SPEC_TREE_ENV_FIXTURE_WRITER_METHODS } from "@/domains/spec/fixture-writer-methods";

export const LITERAL_KIND = {
  STRING: "string",
  NUMBER: "number",
} as const;

export type LiteralKind = (typeof LITERAL_KIND)[keyof typeof LITERAL_KIND];

export interface LiteralLocation {
  readonly file: string;
  readonly line: number;
}

export interface LiteralOccurrence {
  readonly kind: LiteralKind;
  readonly value: string;
  readonly loc: LiteralLocation;
}

export type LiteralIndex = ReadonlyMap<string, readonly LiteralLocation[]>;

export type VisitorKeysMap = Record<string, readonly string[] | undefined>;

export const REMEDIATION = {
  IMPORT_FROM_SOURCE: "import-from-source",
  REFACTOR_TO_SOURCE_OR_GENERATOR: "refactor-to-source-or-generator",
} as const;

export type Remediation = (typeof REMEDIATION)[keyof typeof REMEDIATION];

export interface ReuseFinding {
  readonly test: LiteralLocation;
  readonly kind: LiteralKind;
  readonly value: string;
  readonly src: readonly LiteralLocation[];
  readonly remediation: typeof REMEDIATION.IMPORT_FROM_SOURCE;
}

export interface DupeFinding {
  readonly test: LiteralLocation;
  readonly kind: LiteralKind;
  readonly value: string;
  readonly otherTests: readonly LiteralLocation[];
  readonly remediation: typeof REMEDIATION.REFACTOR_TO_SOURCE_OR_GENERATOR;
}

export interface DetectionResult {
  readonly srcReuse: readonly ReuseFinding[];
  readonly testDupe: readonly DupeFinding[];
}

export interface CollectLiteralsOptions {
  readonly visitorKeys: VisitorKeysMap;
  readonly minStringLength: number;
  readonly minNumberDigits: number;
}

export interface DetectReuseInput {
  readonly srcIndex: LiteralIndex;
  readonly testOccurrencesByFile: ReadonlyMap<string, readonly LiteralOccurrence[]>;
  readonly allowlist: ReadonlySet<string>;
}

export const defaultVisitorKeys: VisitorKeysMap = typescriptVisitorKeys;

export const MODULE_NAMING_SKIP: Record<string, ReadonlySet<string>> = {
  ImportDeclaration: new Set(["source"]),
  ExportNamedDeclaration: new Set(["source"]),
  ExportAllDeclaration: new Set(["source"]),
  ImportExpression: new Set(["source"]),
  TSImportType: new Set(["source", "argument"]),
  TSExternalModuleReference: new Set(["expression"]),
};

const EMPTY_SKIP: ReadonlySet<string> = new Set();
const TEST_PATH_SEGMENT = "/tests/";
const WINDOWS_TEST_PATH_SEGMENT = "\\tests\\";
const TEST_FILE_MARKER = ".test.";
const CALL_EXPRESSION_TYPE = "CallExpression";
const VARIABLE_DECLARATOR_TYPE = "VariableDeclarator";
const IDENTIFIER_TYPE = "Identifier";
const LITERAL_TYPE = "Literal";
const MEMBER_EXPRESSION_TYPE = "MemberExpression";
const TEMPLATE_ELEMENT_TYPE = "TemplateElement";
const FUNCTION_NODE_TYPES: ReadonlySet<string> = new Set([
  "ArrowFunctionExpression",
  "FunctionDeclaration",
  "FunctionExpression",
]);
export const FIXTURE_WRITER_CALLS: ReadonlySet<string> = new Set(
  SPEC_TREE_ENV_FIXTURE_WRITER_METHODS,
);
const FIXTURE_DATA_DIRECT_SEGMENTS: ReadonlySet<string> = new Set(["fixture", "payload"]);
const FIXTURE_DATA_ROLE_SEGMENTS: ReadonlySet<string> = new Set([
  "verdict",
  "session",
  "frontmatter",
  "xml",
  "yaml",
  "json",
  "source",
]);
const FIXTURE_DATA_CONTEXT_SEGMENTS: ReadonlySet<string> = new Set(["path", "tree"]);
const IDENTIFIER_CHAR_KIND = {
  UPPER: "upper",
  LOWER: "lower",
  DIGIT: "digit",
  OTHER: "other",
} as const;
type IdentifierCharKind = (typeof IDENTIFIER_CHAR_KIND)[keyof typeof IDENTIFIER_CHAR_KIND];

interface Node {
  readonly type: string;
  readonly loc?: { readonly start?: { readonly line?: number } };
  readonly value?: unknown;
  readonly raw?: unknown;
  readonly [key: string]: unknown;
}

interface WalkAncestor {
  readonly node: Node;
}

interface WalkContext {
  readonly filename: string;
  readonly isTestFixtureFile: boolean;
}

export function collectLiterals(
  source: string,
  filename: string,
  options: CollectLiteralsOptions,
): LiteralOccurrence[] {
  const ast = parseTypeScript(source, {
    loc: true,
    range: true,
    comment: false,
    jsx: true,
    ecmaVersion: "latest",
    sourceType: "module",
  }) as unknown as Node;
  const out: LiteralOccurrence[] = [];
  const ancestors: WalkAncestor[] = [];
  walk(ast, { filename, isTestFixtureFile: isTestLikeFile(filename) }, ancestors, options, out);
  return out;
}

function walk(
  node: Node,
  context: WalkContext,
  ancestors: WalkAncestor[],
  options: CollectLiteralsOptions,
  out: LiteralOccurrence[],
): void {
  emitLiteral(node, context, ancestors, options, out);

  const keys = options.visitorKeys[node.type];
  if (!keys) {
    return;
  }
  const skip = MODULE_NAMING_SKIP[node.type] ?? EMPTY_SKIP;
  for (const key of keys) {
    if (skip.has(key)) continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (isNode(item)) walkChild(item, node, context, ancestors, options, out);
      }
    } else if (isNode(child)) {
      walkChild(child, node, context, ancestors, options, out);
    }
  }
}

function walkChild(
  node: Node,
  parent: Node,
  context: WalkContext,
  ancestors: WalkAncestor[],
  options: CollectLiteralsOptions,
  out: LiteralOccurrence[],
): void {
  // Shared stack mutation relies on synchronous traversal.
  ancestors.push({ node: parent });
  try {
    walk(node, context, ancestors, options, out);
  } finally {
    ancestors.pop();
  }
}

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && typeof (value as Node).type === "string";
}

function emitLiteral(
  node: Node,
  context: WalkContext,
  ancestors: readonly WalkAncestor[],
  options: CollectLiteralsOptions,
  out: LiteralOccurrence[],
): void {
  if (node.type !== LITERAL_TYPE && node.type !== TEMPLATE_ELEMENT_TYPE) {
    return;
  }
  if (isFixtureDataLiteral(context, ancestors)) {
    return;
  }
  const line = node.loc?.start?.line ?? 0;

  if (node.type === LITERAL_TYPE) {
    emitEstreeLiteral(node, context, line, options, out);
    return;
  }

  emitTemplateElementLiteral(node, context, line, options, out);
}

function emitEstreeLiteral(
  node: Node,
  context: WalkContext,
  line: number,
  options: CollectLiteralsOptions,
  out: LiteralOccurrence[],
): void {
  if (typeof node.value === "string" && node.value.length >= options.minStringLength) {
    out.push({ kind: "string", value: node.value, loc: { file: context.filename, line } });
  } else if (typeof node.value === "number") {
    const raw = typeof node.raw === "string" ? node.raw : String(node.value);
    if (isMeaningfulNumber(raw, options.minNumberDigits)) {
      out.push({ kind: "number", value: String(node.value), loc: { file: context.filename, line } });
    }
  }
}

function emitTemplateElementLiteral(
  node: Node,
  context: WalkContext,
  line: number,
  options: CollectLiteralsOptions,
  out: LiteralOccurrence[],
): void {
  const value = node.value as { readonly cooked?: string } | undefined;
  const cooked = value?.cooked ?? "";
  if (cooked.length >= options.minStringLength) {
    out.push({ kind: "string", value: cooked, loc: { file: context.filename, line } });
  }
}

function isTestLikeFile(filename: string): boolean {
  return filename.includes(TEST_PATH_SEGMENT)
    || filename.includes(WINDOWS_TEST_PATH_SEGMENT)
    || filename.includes(TEST_FILE_MARKER);
}

function isFixtureDataLiteral(
  context: WalkContext,
  ancestors: readonly WalkAncestor[],
): boolean {
  if (!context.isTestFixtureFile) {
    return false;
  }
  return isInsideFixtureWriterArgument(ancestors) || isInsideFixtureDataVariable(ancestors);
}

function isInsideFixtureWriterArgument(ancestors: readonly WalkAncestor[]): boolean {
  // Scan every call ancestor so wrappers around fixture-writer calls do not hide direct writer arguments.
  // Payload helpers inside a fixture writer remain setup data unless a nested function boundary intervenes.
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index];
    if (ancestor.node.type !== CALL_EXPRESSION_TYPE) {
      continue;
    }
    const callName = getCallName(ancestor.node);
    if (callName === undefined || !isFixtureWriterCall(callName)) {
      continue;
    }
    if (hasNestedFunctionBetween(ancestors, index)) {
      continue;
    }
    return true;
  }
  return false;
}

function isFixtureWriterCall(callName: string): boolean {
  return FIXTURE_WRITER_CALLS.has(callName);
}

function isInsideFixtureDataVariable(ancestors: readonly WalkAncestor[]): boolean {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index];
    if (ancestor.node.type !== VARIABLE_DECLARATOR_TYPE) {
      continue;
    }
    if (hasNestedFunctionBetween(ancestors, index)) {
      continue;
    }
    const variableName = getFixtureDataDeclaratorName(ancestor.node);
    if (variableName !== undefined && isFixtureDataVariableName(variableName)) {
      return true;
    }
  }
  return false;
}

function hasNestedFunctionBetween(
  ancestors: readonly WalkAncestor[],
  ancestorIndex: number,
): boolean {
  // The current literal node is passed separately, so this range checks only ancestors between call and literal.
  for (let index = ancestorIndex + 1; index < ancestors.length; index += 1) {
    if (FUNCTION_NODE_TYPES.has(ancestors[index].node.type)) {
      return true;
    }
  }
  return false;
}

function getFixtureDataDeclaratorName(node: Node): string | undefined {
  const bindingName = getIdentifierName(node.id);
  if (bindingName !== undefined) {
    return bindingName;
  }
  // Destructuring defaults are classified by the fixture object they read from.
  // Opaque initializer expressions keep their literals in the occurrence index.
  return getIdentifierName(node.init);
}

function isFixtureDataVariableName(variableName: string): boolean {
  const segments = fixtureClassificationSegments(variableName);
  if (segments.length === 0) {
    return false;
  }
  // Tier 1: explicit fixture markers always denote test-authored data.
  if (segments.some((segment) => FIXTURE_DATA_DIRECT_SEGMENTS.has(segment))) {
    return true;
  }
  // Tier 2 and Tier 3 require at least one fixture role word.
  if (!segments.some((segment) => FIXTURE_DATA_ROLE_SEGMENTS.has(segment))) {
    return false;
  }
  // Tier 2: single-role and compound-role names describe fixture payloads.
  if (segments.every((segment) => FIXTURE_DATA_ROLE_SEGMENTS.has(segment))) {
    return true;
  }
  // Tier 3: role/context compounds are fixtures only when the context word is final.
  const finalSegment = segments.at(-1);
  return finalSegment !== undefined && FIXTURE_DATA_CONTEXT_SEGMENTS.has(finalSegment);
}

function splitIdentifierName(variableName: string): readonly string[] {
  return variableName
    .split("_")
    .flatMap(splitIdentifierPart)
    .map((segment) => segment.toLowerCase());
}

function fixtureClassificationSegments(variableName: string): readonly string[] {
  const segments = splitIdentifierName(variableName);
  if (!isScreamingSnakeIdentifier(variableName)) {
    return segments;
  }

  let first = 0;
  let last = segments.length;
  while (first < last && isSingleLetterSegment(segments[first])) {
    first += 1;
  }
  while (last > first && isSingleLetterSegment(segments[last - 1])) {
    last -= 1;
  }
  return segments.slice(first, last);
}

function isScreamingSnakeIdentifier(variableName: string): boolean {
  return variableName.includes("_")
    && variableName
      .split("_")
      .every((part) => part !== "" && part === part.toUpperCase() && part !== part.toLowerCase());
}

function isSingleLetterSegment(segment: string): boolean {
  return segment.length === 1
    && classifyIdentifierCharacter(segment) === IDENTIFIER_CHAR_KIND.LOWER;
}

function splitIdentifierPart(identifierPart: string): readonly string[] {
  const segments: string[] = [];
  let currentSegment = "";

  for (const character of identifierPart) {
    const kind = classifyIdentifierCharacter(character);
    if (kind === IDENTIFIER_CHAR_KIND.OTHER) {
      pushIdentifierSegment(segments, currentSegment);
      currentSegment = "";
      continue;
    }

    if (currentSegment === "") {
      currentSegment = character;
      continue;
    }

    if (startsNewIdentifierSegment(currentSegment, kind)) {
      if (kind === IDENTIFIER_CHAR_KIND.LOWER && isUppercaseRun(currentSegment)) {
        const prefix = currentSegment.slice(0, -1);
        pushIdentifierSegment(segments, prefix);
        currentSegment = `${currentSegment.at(-1) ?? ""}${character}`;
      } else {
        pushIdentifierSegment(segments, currentSegment);
        currentSegment = character;
      }
      continue;
    }

    currentSegment = `${currentSegment}${character}`;
  }

  pushIdentifierSegment(segments, currentSegment);
  return segments;
}

function classifyIdentifierCharacter(character: string): IdentifierCharKind {
  if (character >= "0" && character <= "9") return IDENTIFIER_CHAR_KIND.DIGIT;
  const lower = character.toLowerCase();
  const upper = character.toUpperCase();
  if (lower === upper) return IDENTIFIER_CHAR_KIND.OTHER;
  return character === upper ? IDENTIFIER_CHAR_KIND.UPPER : IDENTIFIER_CHAR_KIND.LOWER;
}

function startsNewIdentifierSegment(currentSegment: string, nextKind: IdentifierCharKind): boolean {
  const currentKind = classifyIdentifierCharacter(currentSegment.at(-1) ?? "");
  if (nextKind === IDENTIFIER_CHAR_KIND.DIGIT) return currentKind !== IDENTIFIER_CHAR_KIND.DIGIT;
  if (currentKind === IDENTIFIER_CHAR_KIND.DIGIT) return true;
  if (nextKind === IDENTIFIER_CHAR_KIND.UPPER) return currentKind === IDENTIFIER_CHAR_KIND.LOWER;
  return currentKind === IDENTIFIER_CHAR_KIND.UPPER && isUppercaseRun(currentSegment);
}

function isUppercaseRun(value: string): boolean {
  return value.length > 1
    && Array.from(value).every((character) => classifyIdentifierCharacter(character) === IDENTIFIER_CHAR_KIND.UPPER);
}

function pushIdentifierSegment(segments: string[], segment: string): void {
  if (segment !== "") {
    segments.push(segment);
  }
}

function getCallName(node: Node): string | undefined {
  const callee = node.callee;
  if (!isNode(callee)) {
    return undefined;
  }
  if (callee.type === IDENTIFIER_TYPE) {
    return getIdentifierName(callee);
  }
  if (callee.type !== MEMBER_EXPRESSION_TYPE) {
    return undefined;
  }
  const property = callee.property;
  if (isNode(property)) {
    return property.type === IDENTIFIER_TYPE ? getIdentifierName(property) : getLiteralString(property);
  }
  return undefined;
}

function getIdentifierName(value: unknown): string | undefined {
  if (!isNode(value) || value.type !== IDENTIFIER_TYPE) {
    return undefined;
  }
  return typeof value.name === "string" ? value.name : undefined;
}

function getLiteralString(value: unknown): string | undefined {
  if (!isNode(value) || value.type !== LITERAL_TYPE) {
    return undefined;
  }
  return typeof value.value === "string" ? value.value : undefined;
}

function isMeaningfulNumber(raw: string, minDigits: number): boolean {
  const digits = raw.replaceAll(/\D/g, "");
  return digits.length >= minDigits;
}

export function buildIndex(
  occurrences: Iterable<LiteralOccurrence>,
): LiteralIndex {
  const map = new Map<string, LiteralLocation[]>();
  for (const occ of occurrences) {
    const key = makeKey(occ.kind, occ.value);
    const existing = map.get(key);
    if (existing) {
      existing.push(occ.loc);
    } else {
      map.set(key, [occ.loc]);
    }
  }
  return map;
}

function makeKey(kind: LiteralKind, value: string): string {
  return `${kind}\0${value}`;
}

function splitKey(key: string): { kind: LiteralKind; value: string } {
  const idx = key.indexOf("\0");
  return { kind: key.slice(0, idx) as LiteralKind, value: key.slice(idx + 1) };
}

export function detectReuse(input: DetectReuseInput): DetectionResult {
  const srcReuse: ReuseFinding[] = [];
  const testDupe: DupeFinding[] = [];
  const testIndex = buildTestOccurrenceIndex(input.testOccurrencesByFile, input.allowlist);

  for (const [key, byFile] of testIndex) {
    const { kind, value } = splitKey(key);
    const srcLocs = input.srcIndex.get(key);
    const allTestLocs: LiteralLocation[] = [];
    for (const locs of byFile.values()) allTestLocs.push(...locs);

    if (srcLocs && srcLocs.length > 0) {
      srcReuse.push(...reuseFindings(kind, value, srcLocs, allTestLocs));
    } else if (byFile.size >= 2) {
      testDupe.push(...dupeFindings(kind, value, allTestLocs));
    }
  }

  return { srcReuse, testDupe };
}

function buildTestOccurrenceIndex(
  occurrencesByFile: ReadonlyMap<string, readonly LiteralOccurrence[]>,
  allowlist: ReadonlySet<string>,
): Map<string, Map<string, LiteralLocation[]>> {
  const testIndex = new Map<string, Map<string, LiteralLocation[]>>();
  for (const [file, occurrences] of occurrencesByFile) {
    for (const occ of occurrences) {
      if (allowlist.has(occ.value)) continue;
      addTestOccurrence(testIndex, file, occ);
    }
  }
  return testIndex;
}

function addTestOccurrence(
  testIndex: Map<string, Map<string, LiteralLocation[]>>,
  file: string,
  occurrence: LiteralOccurrence,
): void {
  const key = makeKey(occurrence.kind, occurrence.value);
  let byFile = testIndex.get(key);
  if (!byFile) {
    byFile = new Map<string, LiteralLocation[]>();
    testIndex.set(key, byFile);
  }
  const locsInFile = byFile.get(file);
  if (locsInFile) locsInFile.push(occurrence.loc);
  else byFile.set(file, [occurrence.loc]);
}

function reuseFindings(
  kind: LiteralKind,
  value: string,
  srcLocs: readonly LiteralLocation[],
  allTestLocs: readonly LiteralLocation[],
): ReuseFinding[] {
  return allTestLocs.map((testLoc) => ({
    test: testLoc,
    kind,
    value,
    src: srcLocs,
    remediation: REMEDIATION.IMPORT_FROM_SOURCE,
  }));
}

function dupeFindings(
  kind: LiteralKind,
  value: string,
  allTestLocs: readonly LiteralLocation[],
): DupeFinding[] {
  return allTestLocs.map((test, index) => ({
    test,
    kind,
    value,
    otherTests: [...allTestLocs.slice(0, index), ...allTestLocs.slice(index + 1)],
    remediation: REMEDIATION.REFACTOR_TO_SOURCE_OR_GENERATOR,
  }));
}

export function parseLiteralReuseResult(value: unknown): DetectionResult {
  if (!isPlainObject(value)) {
    throw new TypeError("literal-reuse result must be an object");
  }
  const obj = value as { srcReuse?: unknown; testDupe?: unknown };
  if (!Array.isArray(obj.srcReuse)) {
    throw new TypeError("literal-reuse result is missing srcReuse array");
  }
  if (!Array.isArray(obj.testDupe)) {
    throw new TypeError("literal-reuse result is missing testDupe array");
  }
  for (const f of obj.srcReuse) validateReuseFinding(f);
  for (const f of obj.testDupe) validateDupeFinding(f);
  return { srcReuse: obj.srcReuse as readonly ReuseFinding[], testDupe: obj.testDupe as readonly DupeFinding[] };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateLiteralLocation(value: unknown, context: string): void {
  if (!isPlainObject(value)) throw new TypeError(`${context} must be an object`);
  if (typeof value["file"] !== "string") throw new TypeError(`${context}.file must be a string`);
  if (typeof value["line"] !== "number") throw new TypeError(`${context}.line must be a number`);
}

function validateKindValue(value: unknown, context: string): void {
  if (!isPlainObject(value)) throw new TypeError(`${context} must be an object`);
  if (value["kind"] !== "string" && value["kind"] !== "number") {
    throw new TypeError(`${context}.kind must be "string" or "number"`);
  }
  if (typeof value["value"] !== "string") {
    throw new TypeError(`${context}.value must be a string`);
  }
}

function validateReuseFinding(value: unknown): void {
  validateKindValue(value, "srcReuse finding");
  const obj = value as Record<string, unknown>;
  validateLiteralLocation(obj["test"], "srcReuse finding.test");
  if (!Array.isArray(obj["src"])) throw new TypeError("srcReuse finding.src must be an array");
  for (const loc of obj["src"]) validateLiteralLocation(loc, "srcReuse finding.src[i]");
  if (obj["remediation"] !== REMEDIATION.IMPORT_FROM_SOURCE) {
    throw new TypeError(`srcReuse finding.remediation must be "${REMEDIATION.IMPORT_FROM_SOURCE}"`);
  }
}

function validateDupeFinding(value: unknown): void {
  validateKindValue(value, "testDupe finding");
  const obj = value as Record<string, unknown>;
  validateLiteralLocation(obj["test"], "testDupe finding.test");
  if (!Array.isArray(obj["otherTests"])) {
    throw new TypeError("testDupe finding.otherTests must be an array");
  }
  for (const loc of obj["otherTests"]) validateLiteralLocation(loc, "testDupe finding.otherTests[i]");
  if (obj["remediation"] !== REMEDIATION.REFACTOR_TO_SOURCE_OR_GENERATOR) {
    throw new Error(
      `testDupe finding.remediation must be "${REMEDIATION.REFACTOR_TO_SOURCE_OR_GENERATOR}"`,
    );
  }
}
