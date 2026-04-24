import { type DetectionResult, type LiteralLocation, validateLiteralReuse } from "@/validation/literal/index.js";
import { validationEnabled } from "@/validation/steps/eslint.js";

export interface LiteralCommandOptions {
  readonly cwd: string;
  readonly files?: readonly string[];
  readonly json?: boolean;
  readonly quiet?: boolean;
}

export interface ValidationCommandResult {
  readonly exitCode: number;
  readonly output: string;
  readonly durationMs: number;
}

const EXIT_OK = 0;
const EXIT_FINDINGS = 1;

const ENABLE_ENV_KEY = "LITERAL";

export function literalEnabled(): boolean {
  return validationEnabled(ENABLE_ENV_KEY, { [ENABLE_ENV_KEY]: false });
}

export async function literalCommand(
  options: LiteralCommandOptions,
): Promise<ValidationCommandResult> {
  const start = Date.now();

  if (!literalEnabled()) {
    const output = options.quiet
      ? ""
      : "Literal: skipped (disabled by default, set LITERAL_VALIDATION_ENABLED=1 to enable)";
    return { exitCode: EXIT_OK, output, durationMs: Date.now() - start };
  }

  const result = await validateLiteralReuse({
    projectRoot: options.cwd,
    files: options.files,
  });

  const totalFindings = result.findings.srcReuse.length + result.findings.testDupe.length;
  const exitCode = totalFindings === 0 ? EXIT_OK : EXIT_FINDINGS;

  const output = options.json
    ? JSON.stringify(result.findings)
    : options.quiet
    ? ""
    : totalFindings === 0
    ? "Literal: ✓ No findings"
    : `Literal: ✗ ${totalFindings} finding${totalFindings === 1 ? "" : "s"}\n${formatText(result.findings)}`;

  return { exitCode, output, durationMs: Date.now() - start };
}

function formatText(findings: DetectionResult): string {
  const lines: string[] = [];
  for (const f of findings.srcReuse) {
    lines.push(
      `[reuse] ${formatLoc(f.test)}: ${f.kind} literal "${f.value}" also in ${
        f.src
          .map(formatLoc)
          .join(", ")
      } — import from source`,
    );
  }
  for (const f of findings.testDupe) {
    lines.push(
      `[dupe] ${formatLoc(f.test)}: ${f.kind} literal "${f.value}" also in ${
        f.otherTests
          .map(formatLoc)
          .join(", ")
      } — extract to shared test support`,
    );
  }
  return lines.join("\n");
}

function formatLoc(loc: LiteralLocation): string {
  return `${loc.file}:${loc.line}`;
}
