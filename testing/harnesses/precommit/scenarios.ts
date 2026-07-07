import { expect } from "vitest";

import { SONARQUBE_CLOUD_PROPERTIES_FILE } from "@/lib/sonarqube-cloud/check-fixture-exclusions";
import { EXCLUSION_CHECK_EXIT, formatDriftReport, SONAR_EXCLUSIONS_KEY } from "@/lib/sonarqube-cloud/exclusions";
import {
  PRECOMMIT_TEST_FIXTURE,
  PRECOMMIT_TEST_GENERATOR,
  samplePrecommitTestValue,
} from "@testing/generators/precommit/precommit";
import { arbitraryFixturePath } from "@testing/generators/sonarqube-cloud/exclusions";
import { LEFTHOOK_TEST_OUTPUT } from "@testing/harnesses/git-test-constants";
import { withGitEnv } from "@testing/harnesses/with-git-env";

export async function assertPrecommitAllowsFailingTestWithoutRunningTests(): Promise<void> {
  await withGitEnv(async ({ exec, writeFile }) => {
    await writeFile(
      "src/math.ts",
      `export function add(a: number, b: number): number {
  return a + b;
}
`,
    );

    await writeFile(
      "spx/21-math.enabler/tests/math.test.ts",
      `import { expect, it } from "vitest";
import { add } from "../../../src/math.js";

it("${PRECOMMIT_TEST_FIXTURE.FAILING_TEST_NAME}", () => {
  expect(add(1, 1)).toBe(999);
});
`,
    );

    await exec("git add .");

    const result = await exec("git commit -m 'test commit'", { reject: false });

    expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(PRECOMMIT_TEST_FIXTURE.FAILING_TEST_NAME);
  });
}

export async function assertPrecommitAllowsStagedCodeWithUnstagedOtherFile(): Promise<void> {
  await withGitEnv(async ({ exec, writeFile }) => {
    const sourcePath = `src/${samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.pathSegment())}.ts`;
    const otherPath = samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.otherPath());
    const otherContent = samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.fileContent());

    await writeFile(
      sourcePath,
      `export function add(a: number, b: number): number {
  return a + b;
}
`,
    );

    await exec("git add .");
    await writeFile(otherPath, otherContent);

    const result = await exec("git commit -m 'test commit'", { reject: false });

    expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0);
  });
}

export async function assertPrecommitSkipsTestsForNonFixtureFiles(): Promise<void> {
  await withGitEnv(async ({ exec, writeFile }) => {
    const otherPath = samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.otherPath());

    await writeFile(otherPath, "# Test Project\n\nThis is a test.\n");
    await exec(`git add ${otherPath}`);

    const result = await exec("git commit -m 'docs: add readme'", { reject: false });

    expect(result.exitCode).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(LEFTHOOK_TEST_OUTPUT.SKIP_NO_MATCHING_STAGED_FILES);
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(PRECOMMIT_TEST_FIXTURE.PASSING_TEST_NAME);
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(PRECOMMIT_TEST_FIXTURE.FAILING_TEST_NAME);
  });
}

export async function assertPrecommitRunsFixtureExclusionCheckForMatchingFiles(): Promise<void> {
  await withGitEnv(async ({ exec, writeFile }) => {
    const fixturePath = samplePrecommitTestValue(arbitraryFixturePath());
    const fixtureContent = samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.fileContent());

    await writeFile(SONARQUBE_CLOUD_PROPERTIES_FILE, `${SONAR_EXCLUSIONS_KEY}=\n`);
    await writeFile(fixturePath, fixtureContent);
    await exec(["git", "add", SONARQUBE_CLOUD_PROPERTIES_FILE, fixturePath]);

    const result = await exec("git commit -m 'test fixture exclusions'", { reject: false });

    expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(EXCLUSION_CHECK_EXIT.DRIFT);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      formatDriftReport({ missing: [fixturePath], extra: [] }),
    );
  });
}
