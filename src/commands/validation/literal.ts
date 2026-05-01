import { resolveConfig } from "@/config/index";
import { detectTypeScript } from "@/validation/discovery/index";
import { type LiteralConfig, literalConfigDescriptor } from "@/validation/literal/config";
import { type DetectionResult, type LiteralLocation, validateLiteralReuse } from "@/validation/literal/index";
import { validationEnabled } from "@/validation/steps/eslint";

export interface LiteralCommandOptions {
  readonly cwd: string;
  readonly files?: readonly string[];
  readonly json?: boolean;
  readonly quiet?: boolean;
  readonly config?: LiteralConfig;
}

export interface ValidationCommandResult {
  readonly exitCode: number;
  readonly output: string;
  readonly durationMs: number;
}

const EXIT_OK = 0;
const EXIT_FINDINGS = 1;
const EXIT_CONFIG_ERROR = 2;
const TYPESCRIPT_ABSENT_MESSAGE = "⏭ Skipping Literal (TypeScript not detected in project)";
const DISABLED_MESSAGE = "⏭ Skipping Literal (LITERAL_VALIDATION_ENABLED=0)";

export async function literalCommand(
  options: LiteralCommandOptions,
): Promise<ValidationCommandResult> {
  const start = Date.now();

  const tsDetection = detectTypeScript(options.cwd);
  if (!tsDetection.present) {
    return {
      exitCode: EXIT_OK,
      output: options.quiet ? "" : TYPESCRIPT_ABSENT_MESSAGE,
      durationMs: Date.now() - start,
    };
  }

  if (!validationEnabled("LITERAL")) {
    return {
      exitCode: EXIT_OK,
      output: options.quiet ? "" : DISABLED_MESSAGE,
      durationMs: Date.now() - start,
    };
  }

  let resolvedConfig: LiteralConfig;
  if (options.config !== undefined) {
    resolvedConfig = options.config;
  } else {
    const loaded = await resolveConfig(options.cwd, [literalConfigDescriptor]);
    if (!loaded.ok) {
      return {
        exitCode: EXIT_CONFIG_ERROR,
        output: `Literal: ✗ config error — ${loaded.error}`,
        durationMs: Date.now() - start,
      };
    }
    resolvedConfig = loaded.value[literalConfigDescriptor.section] as LiteralConfig;
  }

  const result = await validateLiteralReuse({
    projectRoot: options.cwd,
    files: options.files,
    config: resolvedConfig,
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
