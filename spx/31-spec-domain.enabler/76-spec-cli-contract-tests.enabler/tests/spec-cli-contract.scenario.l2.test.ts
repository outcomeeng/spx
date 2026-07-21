import { describe, expect, it } from "vitest";

import { SPEC_NEXT_MESSAGE } from "@/commands/spec/next";
import { SPEC_CONTEXT_CONTENT_MESSAGE, SPEC_DOMAIN_CLI } from "@/interfaces/cli/spec";
import { KIND_REGISTRY, SPEC_CONTEXT_READ_ROLE, SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import {
  specCliApplyProtectionFixture,
  specCliDeclaredStatusRows,
  specCliUnsupportedStatusFormatFixture,
} from "@testing/generators/spec-tree/spec-cli";
import { RETIRED_SPEC_APPLY_FIXTURE, specTreeFixtureNodeDirectoryName } from "@testing/generators/spec-tree/spec-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { parseContextManifest, runSpecCli } from "@testing/harnesses/spec/context";

function assertDeclaredStatusRows(
  output: string,
  fixture: Parameters<typeof specCliDeclaredStatusRows>[0],
): void {
  const expectedRows = specCliDeclaredStatusRows(fixture);
  expect(output.split("\n")).toEqual(expectedRows.map((row) => row.output));
  for (const row of expectedRows) {
    expect(output).toContain(row.nodeId);
    expect(output).toContain(`[${row.state}]`);
  }
}

describe("spx spec process contract", () => {
  it("routes status through the packaged executable", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const result = await runSpecCli(env.productDir, SPEC_DOMAIN_CLI.COMMAND, SPEC_DOMAIN_CLI.STATUS_COMMAND);
      expect(result.exitCode).toBe(0);
      assertDeclaredStatusRows(result.stdout, env.fixture);
    });
  });

  it("accepts the status --update flag through the packaged executable", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const result = await runSpecCli(
        env.productDir,
        SPEC_DOMAIN_CLI.COMMAND,
        SPEC_DOMAIN_CLI.STATUS_COMMAND,
        SPEC_DOMAIN_CLI.UPDATE_OPTION,
      );
      expect(result.exitCode, result.stderr).toBe(0);
      assertDeclaredStatusRows(result.stdout, env.fixture);
    });
  });

  it("routes next through the packaged executable", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const result = await runSpecCli(env.productDir, SPEC_DOMAIN_CLI.COMMAND, SPEC_DOMAIN_CLI.NEXT_COMMAND);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(SPEC_NEXT_MESSAGE.HEADING);
      expect(result.stdout).toContain(env.fixture.root.slug);
    });
  });

  it("routes context through the packaged executable", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const target = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);
      const result = await runSpecCli(
        env.productDir,
        SPEC_DOMAIN_CLI.COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_SHOW_COMMAND,
        target,
        SPEC_DOMAIN_CLI.JSON_OPTION,
      );
      expect(result.exitCode, result.stderr).toBe(0);
      const manifest = parseContextManifest(result.stdout);
      expect(manifest.targets).toEqual([`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${target}`]);
      expect(
        manifest.read.some((document) =>
          document.roles.some((binding) => binding.role === SPEC_CONTEXT_READ_ROLE.PRODUCT)
        ),
      ).toBe(true);
    });
  });

  it("routes content-bearing context through the packaged executable", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const target = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);
      const result = await runSpecCli(
        env.productDir,
        SPEC_DOMAIN_CLI.COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_SHOW_COMMAND,
        target,
        SPEC_DOMAIN_CLI.JSON_OPTION,
        SPEC_DOMAIN_CLI.CONTENT_OPTION,
      );
      expect(result.exitCode, result.stderr).toBe(0);
      const manifest = parseContextManifest(result.stdout);
      expect(manifest.read.length).toBeGreaterThan(0);
      for (const document of manifest.read) {
        expect(document.content).toBeDefined();
        expect(document.digest).toBeDefined();
        expect(document.bytes).toBeDefined();
      }
    });
  });

  it("rejects a content request without the machine output flag", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const target = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);
      const result = await runSpecCli(
        env.productDir,
        SPEC_DOMAIN_CLI.COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_SHOW_COMMAND,
        target,
        SPEC_DOMAIN_CLI.CONTENT_OPTION,
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(SPEC_CONTEXT_CONTENT_MESSAGE.REQUIRES_JSON);
    });
  });

  it("rejects an unsupported status output format", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const fixture = specCliUnsupportedStatusFormatFixture(env.fixture);
      const result = await runSpecCli(
        env.productDir,
        SPEC_DOMAIN_CLI.COMMAND,
        SPEC_DOMAIN_CLI.STATUS_COMMAND,
        SPEC_DOMAIN_CLI.FORMAT_OPTION_FLAG,
        fixture.format,
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe(fixture.expectedDiagnostic);
    });
  });

  it("rejects config-writing apply routing without modifying product configuration", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const fixture = specCliApplyProtectionFixture(env.fixture);
      await env.writeRaw(RETIRED_SPEC_APPLY_FIXTURE.excludeFile, fixture.excludeContent);
      await env.writeRaw(RETIRED_SPEC_APPLY_FIXTURE.pythonConfigFile, fixture.pythonConfigContent);
      const before = await Promise.all(fixture.protectedPaths.map((path) => env.readFile(path)));
      const result = await runSpecCli(env.productDir, SPEC_DOMAIN_CLI.COMMAND, RETIRED_SPEC_APPLY_FIXTURE.command);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(RETIRED_SPEC_APPLY_FIXTURE.unknownCommandPrefix);
      expect(result.stderr).toContain(RETIRED_SPEC_APPLY_FIXTURE.command);
      await expect(Promise.all(fixture.protectedPaths.map((path) => env.readFile(path)))).resolves.toEqual(before);
    });
  });
});
