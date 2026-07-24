import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { validateLintPolicy } from "@/validation/lint-policy";
import { VALIDATION_LINT_POLICY_DATA } from "@testing/generators/validation/lint-policy";
import { GIT_TEST_CONFIG, GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const LINT_POLICY_OBSERVATION_PREFIX = "spx-lint-policy-observation-";

export async function observeTestOwnedConstantDebtAddition() {
  return withTempDir(LINT_POLICY_OBSERVATION_PREFIX, async (productDir) => {
    await runGit(productDir, [
      GIT_TEST_SUBCOMMANDS.INIT,
      "--initial-branch",
      VALIDATION_LINT_POLICY_DATA.baseRefs.LOCAL_MAIN,
    ]);
    await runGit(productDir, [GIT_TEST_SUBCOMMANDS.CONFIG, "user.email", GIT_TEST_CONFIG.EMAIL]);
    await runGit(productDir, [GIT_TEST_SUBCOMMANDS.CONFIG, "user.name", GIT_TEST_CONFIG.USER_NAME]);
    await mkdir(join(productDir, VALIDATION_LINT_POLICY_DATA.baseTestDebtPath), { recursive: true });
    await writePolicyManifests(productDir, [VALIDATION_LINT_POLICY_DATA.baseTestDebtPath]);
    await runGit(productDir, [GIT_TEST_SUBCOMMANDS.ADD, "."]);
    await runGit(productDir, [
      GIT_TEST_SUBCOMMANDS.COMMIT,
      "-m",
      VALIDATION_LINT_POLICY_DATA.commitMessages.base,
    ]);
    await runGit(productDir, [
      GIT_TEST_SUBCOMMANDS.CHECKOUT,
      "-b",
      VALIDATION_LINT_POLICY_DATA.testBranch,
    ]);
    await mkdir(join(productDir, VALIDATION_LINT_POLICY_DATA.addedTestDebtPath), { recursive: true });
    await writePolicyManifests(productDir, [
      VALIDATION_LINT_POLICY_DATA.baseTestDebtPath,
      VALIDATION_LINT_POLICY_DATA.addedTestDebtPath,
    ]);

    return {
      addedPath: VALIDATION_LINT_POLICY_DATA.addedTestDebtPath,
      manifestPath: VALIDATION_LINT_POLICY_DATA.manifests.TEST_OWNED_CONSTANT_DEBT_NODES.file,
      result: validateLintPolicy(productDir),
    };
  });
}

async function writePolicyManifests(productDir: string, testOwnedConstantDebtNodes: readonly string[]): Promise<void> {
  const testDebt = VALIDATION_LINT_POLICY_DATA.manifests.TEST_LINT_DEBT_NODES;
  const testOwned = VALIDATION_LINT_POLICY_DATA.manifests.TEST_OWNED_CONSTANT_DEBT_NODES;
  await writeFile(join(productDir, testDebt.file), JSON.stringify({ [testDebt.key]: [] }));
  await writeFile(
    join(productDir, testOwned.file),
    JSON.stringify({ [testOwned.key]: testOwnedConstantDebtNodes }),
  );
}
