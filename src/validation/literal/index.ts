import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { DEFAULT_SCOPE_CONFIG } from "@/lib/file-inclusion/config";
import { EXPLICIT_OVERRIDE_LAYER, resolveScope } from "@/lib/file-inclusion/pipeline";
import type { ScopeEntry } from "@/lib/file-inclusion/types";
import { type ValidationPathConfig } from "@/validation/config/descriptor";
import { pathPassesValidationFilter } from "@/validation/config/path-filter";
import { pathPassesTypeScriptScope } from "@/validation/config/scope";
import type { ScopeConfig } from "@/validation/types";

import { type LiteralConfig, literalConfigDescriptor, resolveAllowlist } from "./config";
import {
  buildIndex,
  collectLiterals,
  defaultVisitorKeys,
  type DetectionResult,
  detectReuse,
  type LiteralOccurrence,
} from "./detector";
import { isTestFile, isTypescriptSource } from "./walker";

export { literalConfigDescriptor, resolveAllowlist } from "./config";
export type { LiteralConfig } from "./config";
export {
  buildIndex,
  collectLiterals,
  defaultVisitorKeys,
  detectReuse,
  FIXTURE_WRITER_CALLS,
  LITERAL_KIND,
  MODULE_NAMING_SKIP,
  parseLiteralReuseResult,
  REMEDIATION,
} from "./detector";
export type {
  DetectionResult,
  DupeFinding,
  LiteralIndex,
  LiteralKind,
  LiteralLocation,
  LiteralOccurrence,
  Remediation,
  ReuseFinding,
  VisitorKeysMap,
} from "./detector";

export interface ValidateLiteralReuseInput {
  readonly productDir: string;
  readonly files?: readonly string[];
  readonly explicitFiles?: readonly string[];
  readonly config?: LiteralConfig;
  readonly pathConfig?: ValidationPathConfig;
  readonly scopeConfig?: ScopeConfig;
}

export interface ValidateLiteralReuseResult {
  readonly findings: DetectionResult;
  readonly indexedOccurrencesByFile: ReadonlyMap<string, readonly LiteralOccurrence[]>;
  readonly filteredByValidationPathNoMatches?: boolean;
}

export const DEFAULT_LITERAL_COLLECT_OPTIONS = {
  visitorKeys: defaultVisitorKeys,
  minStringLength: literalConfigDescriptor.defaults.minStringLength,
  minNumberDigits: literalConfigDescriptor.defaults.minNumberDigits,
} as const;

export function createEmptyLiteralAllowlist(): ReadonlySet<string> {
  return new Set();
}

export async function validateLiteralReuse(
  input: ValidateLiteralReuseInput,
): Promise<ValidateLiteralReuseResult> {
  const config = input.config ?? literalConfigDescriptor.defaults;
  const explicitFiles = input.explicitFiles ?? (input.scopeConfig === undefined ? input.files : undefined);
  const explicitPaths = explicitFiles?.map((f) => {
    const abs = isAbsolute(f) ? f : resolve(input.productDir, f);
    return relative(input.productDir, abs).split(/[\\/]/g).join("/");
  });

  const request = input.scopeConfig === undefined && input.files
    ? { explicit: explicitPaths }
    : { walkRoot: input.productDir, explicit: explicitPaths };

  const scope = await resolveScope(input.productDir, {
    ...request,
    domainPathFilter: input.scopeConfig === undefined && input.files !== undefined ? undefined : input.pathConfig,
  }, DEFAULT_SCOPE_CONFIG);

  const literalScopeConfig = input.scopeConfig;
  const pathFiltered = input.scopeConfig === undefined && input.files !== undefined
    ? scope.included
    : applyPathFilter(scope.included, input.pathConfig);
  const filtered = literalScopeConfig === undefined
    ? pathFiltered
    : pathFiltered.filter((entry) =>
      entry.decisionTrail.some((decision) => decision.layer === EXPLICIT_OVERRIDE_LAYER)
      || pathPassesTypeScriptScope(entry.path, literalScopeConfig)
    );

  const candidateFiles = filtered
    .filter((entry) => isTypescriptSource(entry.path))
    .map((entry) => resolve(input.productDir, entry.path));

  const collectOptions = {
    visitorKeys: defaultVisitorKeys,
    minStringLength: config.minStringLength,
    minNumberDigits: config.minNumberDigits,
  };

  const srcOccurrences: LiteralOccurrence[] = [];
  const testOccurrencesByFile = new Map<string, readonly LiteralOccurrence[]>();
  const indexedOccurrencesByFile = new Map<string, readonly LiteralOccurrence[]>();

  for (const abs of candidateFiles) {
    const rel = relative(input.productDir, abs).split(/[\\/]/g).join("/");

    const content = await readSafe(abs);
    if (content === null) continue;

    const occurrences = collectLiterals(content, rel, collectOptions);
    indexedOccurrencesByFile.set(rel, occurrences);
    if (isTestFile(rel)) {
      testOccurrencesByFile.set(rel, occurrences);
    } else {
      srcOccurrences.push(...occurrences);
    }
  }

  const srcIndex = buildIndex(srcOccurrences);
  const findings = detectReuse({
    srcIndex,
    testOccurrencesByFile,
    allowlist: resolveAllowlist(config),
  });

  return {
    findings,
    indexedOccurrencesByFile,
    filteredByValidationPathNoMatches: input.scopeConfig?.filteredByValidationPathNoMatches,
  };
}

async function readSafe(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (err: unknown) {
    if (typeof err === "object" && err !== null && "code" in err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "EISDIR") return null;
    }
    throw err;
  }
}

function applyPathFilter(
  entries: readonly ScopeEntry[],
  pathConfig: ValidationPathConfig | undefined,
): readonly ScopeEntry[] {
  if (pathConfig === undefined) {
    return entries;
  }
  return entries.filter((entry) => pathPassesValidationFilter(entry.path, pathConfig));
}
