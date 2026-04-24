import { parse as parseTypeScript } from "@typescript-eslint/parser";
import { visitorKeys as typescriptVisitorKeys } from "@typescript-eslint/visitor-keys";

export type LiteralKind = "string" | "number";

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
  EXTRACT_TO_SHARED_TEST_SUPPORT: "extract-to-shared-test-support",
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
  readonly remediation: typeof REMEDIATION.EXTRACT_TO_SHARED_TEST_SUPPORT;
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

interface Node {
  readonly type: string;
  readonly loc?: { readonly start?: { readonly line?: number } };
  readonly value?: unknown;
  readonly raw?: unknown;
  readonly [key: string]: unknown;
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
  walk(ast, filename, options, out);
  return out;
}

function walk(
  node: Node,
  filename: string,
  options: CollectLiteralsOptions,
  out: LiteralOccurrence[],
): void {
  emitLiteral(node, filename, options, out);

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
        if (isNode(item)) walk(item, filename, options, out);
      }
    } else if (isNode(child)) {
      walk(child, filename, options, out);
    }
  }
}

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && typeof (value as Node).type === "string";
}

function emitLiteral(
  node: Node,
  filename: string,
  options: CollectLiteralsOptions,
  out: LiteralOccurrence[],
): void {
  const line = node.loc?.start?.line ?? 0;

  if (node.type === "Literal") {
    if (typeof node.value === "string") {
      if (node.value.length >= options.minStringLength) {
        out.push({ kind: "string", value: node.value, loc: { file: filename, line } });
      }
    } else if (typeof node.value === "number") {
      const raw = typeof node.raw === "string" ? node.raw : String(node.value);
      if (isMeaningfulNumber(raw, options.minNumberDigits)) {
        out.push({ kind: "number", value: String(node.value), loc: { file: filename, line } });
      }
    }
    return;
  }

  if (node.type === "TemplateElement") {
    const value = node.value as { readonly cooked?: string } | undefined;
    const cooked = value?.cooked ?? "";
    if (cooked.length >= options.minStringLength) {
      out.push({ kind: "string", value: cooked, loc: { file: filename, line } });
    }
  }
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
          remediation: REMEDIATION.EXTRACT_TO_SHARED_TEST_SUPPORT,
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
  if (obj["remediation"] !== REMEDIATION.EXTRACT_TO_SHARED_TEST_SUPPORT) {
    throw new Error(
      `testDupe finding.remediation must be "${REMEDIATION.EXTRACT_TO_SHARED_TEST_SUPPORT}"`,
    );
  }
}
