import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { DEFAULT_SCOPE_CONFIG } from "@/lib/file-inclusion/config";
import { resolveScope } from "@/lib/file-inclusion/pipeline";
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
export type { LiteralAllowlistConfig, LiteralConfig } from "./config";
export {
  buildIndex,
  collectLiterals,
  defaultVisitorKeys,
  detectReuse,
  FIXTURE_WRITER_CALLS,
  LITERAL_KIND,
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

  const request = input.files
    ? {
      explicit: input.files.map((f) => {
        const abs = isAbsolute(f) ? f : resolve(input.projectRoot, f);
        return relative(input.projectRoot, abs).split(/[\\/]/g).join("/");
      }),
    }
    : { walkRoot: input.projectRoot };

  const scope = await resolveScope(input.projectRoot, request, DEFAULT_SCOPE_CONFIG);

  const candidateFiles = scope.included
    .filter((entry) => isTypescriptSource(entry.path))
    .map((entry) => resolve(input.projectRoot, entry.path));

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
