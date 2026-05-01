import { parse as parseTypeScript } from "@typescript-eslint/parser";
import { visitorKeys as typescriptVisitorKeys } from "@typescript-eslint/visitor-keys";

import { SPEC_TREE_ENV_FIXTURE_WRITER_METHODS } from "@/spec/fixture-writer-methods";

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

const MODULE_NAMING_SKIP: Record<string, ReadonlySet<string>> = {
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
export const LITERAL_TEST_FIXTURE_WRITER_METHODS = [
  "writeSourceWithLiteral",
  "writeTestWithLiteral",
] as const satisfies readonly string[];
const LITERAL_TEST_FIXTURE_WRITER_CALLS: ReadonlySet<string> = new Set(
  LITERAL_TEST_FIXTURE_WRITER_METHODS,
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
const IDENTIFIER_SEGMENT_PATTERN = /[A-Z]+(?=[A-Z][a-z]|$)|[A-Z]?[a-z]+|[0-9]+/g;

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
    if (typeof node.value === "string") {
      if (node.value.length >= options.minStringLength) {
        out.push({ kind: "string", value: node.value, loc: { file: context.filename, line } });
      }
    } else if (typeof node.value === "number") {
      const raw = typeof node.raw === "string" ? node.raw : String(node.value);
      if (isMeaningfulNumber(raw, options.minNumberDigits)) {
        out.push({ kind: "number", value: String(node.value), loc: { file: context.filename, line } });
      }
    }
    return;
  }

  if (node.type === TEMPLATE_ELEMENT_TYPE) {
    const value = node.value as { readonly cooked?: string } | undefined;
    const cooked = value?.cooked ?? "";
    if (cooked.length >= options.minStringLength) {
      out.push({ kind: "string", value: cooked, loc: { file: context.filename, line } });
    }
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
  return FIXTURE_WRITER_CALLS.has(callName) || LITERAL_TEST_FIXTURE_WRITER_CALLS.has(callName);
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
  const segments = splitIdentifierName(variableName);
  if (segments.length === 0) {
    return false;
  }
  if (segments.some((segment) => FIXTURE_DATA_DIRECT_SEGMENTS.has(segment))) {
    return true;
  }
  if (!segments.some((segment) => FIXTURE_DATA_ROLE_SEGMENTS.has(segment))) {
    return false;
  }
  // Single-role and compound-role names describe fixture data in tests.
  if (segments.every((segment) => FIXTURE_DATA_ROLE_SEGMENTS.has(segment))) {
    return true;
  }
  const finalSegment = segments[segments.length - 1];
  return finalSegment !== undefined && FIXTURE_DATA_CONTEXT_SEGMENTS.has(finalSegment);
}

function splitIdentifierName(variableName: string): readonly string[] {
  return variableName
    .split("_")
    .flatMap((part) => part.match(IDENTIFIER_SEGMENT_PATTERN) ?? [])
    .map((segment) => segment.toLowerCase());
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
  const digits = raw.replace(/[^0-9]/g, "");
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

  const testIndex = new Map<string, Map<string, LiteralLocation[]>>();
  for (const [file, occurrences] of input.testOccurrencesByFile) {
    for (const occ of occurrences) {
      if (input.allowlist.has(occ.value)) continue;
      const key = makeKey(occ.kind, occ.value);
      let byFile = testIndex.get(key);
      if (!byFile) {
        byFile = new Map<string, LiteralLocation[]>();
        testIndex.set(key, byFile);
      }
      const locsInFile = byFile.get(file);
      if (locsInFile) locsInFile.push(occ.loc);
      else byFile.set(file, [occ.loc]);
    }
  }

  for (const [key, byFile] of testIndex) {
    const { kind, value } = splitKey(key);
    const srcLocs = input.srcIndex.get(key);
    const allTestLocs: LiteralLocation[] = [];
    for (const locs of byFile.values()) allTestLocs.push(...locs);

    if (srcLocs && srcLocs.length > 0) {
      for (const testLoc of allTestLocs) {
        srcReuse.push({
          test: testLoc,
          kind,
          value,
          src: srcLocs,
          remediation: REMEDIATION.IMPORT_FROM_SOURCE,
        });
      }
    } else if (byFile.size >= 2) {
      for (let i = 0; i < allTestLocs.length; i += 1) {
        const otherTests = [...allTestLocs.slice(0, i), ...allTestLocs.slice(i + 1)];
        testDupe.push({
          test: allTestLocs[i],
          kind,
          value,
          otherTests,
          remediation: REMEDIATION.REFACTOR_TO_SOURCE_OR_GENERATOR,
        });
      }
    }
  }

  return { srcReuse, testDupe };
}

export function parseLiteralReuseResult(value: unknown): DetectionResult {
  if (!isPlainObject(value)) {
    throw new Error("literal-reuse result must be an object");
  }
  const obj = value as { srcReuse?: unknown; testDupe?: unknown };
  if (!Array.isArray(obj.srcReuse)) {
    throw new Error("literal-reuse result is missing srcReuse array");
  }
  if (!Array.isArray(obj.testDupe)) {
    throw new Error("literal-reuse result is missing testDupe array");
  }
  for (const f of obj.srcReuse) validateReuseFinding(f);
  for (const f of obj.testDupe) validateDupeFinding(f);
  return { srcReuse: obj.srcReuse as readonly ReuseFinding[], testDupe: obj.testDupe as readonly DupeFinding[] };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateLiteralLocation(value: unknown, context: string): void {
  if (!isPlainObject(value)) throw new Error(`${context} must be an object`);
  if (typeof value["file"] !== "string") throw new Error(`${context}.file must be a string`);
  if (typeof value["line"] !== "number") throw new Error(`${context}.line must be a number`);
}

function validateKindValue(value: unknown, context: string): void {
  if (!isPlainObject(value)) throw new Error(`${context} must be an object`);
  if (value["kind"] !== "string" && value["kind"] !== "number") {
    throw new Error(`${context}.kind must be "string" or "number"`);
  }
  if (typeof value["value"] !== "string") {
    throw new Error(`${context}.value must be a string`);
  }
}

function validateReuseFinding(value: unknown): void {
  validateKindValue(value, "srcReuse finding");
  const obj = value as Record<string, unknown>;
  validateLiteralLocation(obj["test"], "srcReuse finding.test");
  if (!Array.isArray(obj["src"])) throw new Error("srcReuse finding.src must be an array");
  for (const loc of obj["src"]) validateLiteralLocation(loc, "srcReuse finding.src[i]");
  if (obj["remediation"] !== REMEDIATION.IMPORT_FROM_SOURCE) {
    throw new Error(`srcReuse finding.remediation must be "${REMEDIATION.IMPORT_FROM_SOURCE}"`);
  }
}

function validateDupeFinding(value: unknown): void {
  validateKindValue(value, "testDupe finding");
  const obj = value as Record<string, unknown>;
  validateLiteralLocation(obj["test"], "testDupe finding.test");
  if (!Array.isArray(obj["otherTests"])) {
    throw new Error("testDupe finding.otherTests must be an array");
  }
  for (const loc of obj["otherTests"]) validateLiteralLocation(loc, "testDupe finding.otherTests[i]");
  if (obj["remediation"] !== REMEDIATION.REFACTOR_TO_SOURCE_OR_GENERATOR) {
    throw new Error(
      `testDupe finding.remediation must be "${REMEDIATION.REFACTOR_TO_SOURCE_OR_GENERATOR}"`,
    );
  }
}
