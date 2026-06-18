import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { VALIDATION_COMMAND_OUTPUT, VALIDATION_EXIT_CODES } from "@/commands/validation/messages";
import { validationCliDefinition } from "@/interfaces/cli/validation";
import { TSCONFIG_FILES } from "@/validation/config/scope";
import {
  VALIDATION_PIPELINE_DATA,
  validationCircularSubprocessScenarios,
} from "@testing/generators/validation/validation";
import { expectValidationSubprocessResult, runValidationSubprocess } from "@testing/harnesses/validation/cli";
import { PROJECT_FIXTURES, withValidationEnv } from "@testing/harnesses/with-validation-env";

async function writeTestOnlyCycle(path: string): Promise<void> {
  const testsDir = join(path, "tests");
  await mkdir(testsDir, { recursive: true });
  await writeFile(
    join(path, TSCONFIG_FILES.full),
    JSON.stringify({
      compilerOptions: {
        target: "ES2020",
        module: "commonjs",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
      },
      include: ["src/**/*", "tests/**/*"],
    }),
  );
  await writeFile(
    join(path, TSCONFIG_FILES.production),
    JSON.stringify({
      extends: `./${TSCONFIG_FILES.full}`,
      include: ["src/**/*"],
    }),
  );
  await writeFile(
    join(testsDir, "cycle-a.ts"),
    `import { cycleB } from "./cycle-b";\n\nexport function cycleA(): string {\n  return cycleB();\n}\n`,
  );
  await writeFile(
    join(testsDir, "cycle-b.ts"),
    `import { cycleA } from "./cycle-a";\n\nexport function cycleB(): string {\n  return cycleA();\n}\n`,
  );
}

describe("circular dependency validation subprocess", () => {
  for (const scenario of validationCircularSubprocessScenarios()) {
    it(
      scenario.title,
      { timeout: scenario.timeout },
      async () => {
        await withValidationEnv({ fixture: scenario.fixture }, async ({ path }) => {
          const result = await runValidationSubprocess(scenario.args, {
            cwd: path,
            timeout: scenario.timeout,
          });

          expectValidationSubprocessResult(result, scenario);
        });
      },
    );
  }

  it(
    "production scope ignores circular dependencies outside production TypeScript scope",
    { timeout: 30_000 },
    async () => {
      await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
        await writeTestOnlyCycle(path);

        const result = await runValidationSubprocess(
          [
            validationCliDefinition.subcommands.circular.commandName,
            VALIDATION_PIPELINE_DATA.scopeFlag,
            VALIDATION_PIPELINE_DATA.productionScope,
          ],
          { cwd: path },
        );

        expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
        expect(result.stdout).toContain(VALIDATION_COMMAND_OUTPUT.CIRCULAR_NONE_FOUND);
        expect(result.stdout).not.toContain(VALIDATION_COMMAND_OUTPUT.CIRCULAR_FOUND);
      });
    },
  );
});
