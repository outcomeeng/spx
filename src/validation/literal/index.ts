import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { type LiteralConfig, literalConfigDescriptor, resolveAllowlist } from "./config.js";
import {
  buildIndex,
  collectLiterals,
  defaultVisitorKeys,
  type DetectionResult,
  detectReuse,
  type LiteralOccurrence,
} from "./detector.js";
import { isUnderExcluded, readExcludePaths } from "./exclude.js";
import { isTestFile, walkTypescriptFiles } from "./walker.js";

export { literalConfigDescriptor, resolveAllowlist } from "./config.js";
export type { LiteralAllowlistConfig, LiteralConfig } from "./config.js";
export {
  buildIndex,
  collectLiterals,
  defaultVisitorKeys,
  detectReuse,
  parseLiteralReuseResult,
  REMEDIATION,
} from "./detector.js";
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
} from "./detector.js";

export interface ValidateLiteralReuseInput {
  readonly projectRoot: string;
  readonly files?: readonly string[];
  readonly config?: LiteralConfig;
}

export interface ValidateLiteralReuseResult {
  readonly findings: DetectionResult;
  readonly indexedOccurrencesByFile: ReadonlyMap<string, readonly LiteralOccurrence[]>;
}

export async function validateLiteralReuse(
  input: ValidateLiteralReuseInput,
): Promise<ValidateLiteralReuseResult> {
  const config = input.config ?? literalConfigDescriptor.defaults;
  const excludePaths = await readExcludePaths(input.projectRoot);

  const candidateFiles = input.files
    ? input.files.map((f) => (isAbsolute(f) ? f : resolve(input.projectRoot, f)))
    : await walkTypescriptFiles(input.projectRoot, excludePaths);

  const collectOptions = {
    visitorKeys: defaultVisitorKeys,
    minStringLength: config.minStringLength,
    minNumberDigits: config.minNumberDigits,
  };

  const srcOccurrences: LiteralOccurrence[] = [];
  const testOccurrencesByFile = new Map<string, readonly LiteralOccurrence[]>();
  const indexedOccurrencesByFile = new Map<string, readonly LiteralOccurrence[]>();

  for (const abs of candidateFiles) {
    const rel = relative(input.projectRoot, abs).split(/[\\/]/g).join("/");
    if (isUnderExcluded(rel, excludePaths)) continue;

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
    allowlist: resolveAllowlist(config.allowlist),
  });

  return { findings, indexedOccurrencesByFile };
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
