import { describe, expect, it } from "vitest";

import { SPEC_NEXT_MESSAGE } from "@/commands/spec/next";
import { SPEC_DOMAIN_CLI } from "@/interfaces/cli/spec";
import { KIND_REGISTRY, SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION } from "@/lib/spec-tree";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import {
  RETIRED_SPEC_CONTEXT_CONTENT_FIXTURE,
  specCliApplyProtectionFixture,
  specCliDeclaredStatusRows,
  specCliUnsupportedStatusFormatFixture,
} from "@testing/generators/spec-tree/spec-cli";
import { RETIRED_SPEC_APPLY_FIXTURE, specTreeFixtureNodeDirectoryName } from "@testing/generators/spec-tree/spec-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextListManifest,
  parseContextManifest,
  runSpecCli,
  runSpecCliWithIsolation,
  specTreeKindsConfig,
} from "@testing/harnesses/spec/context";

describe("spx spec process contract", () => {
  it("routes status through the packaged executable", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const result = await runSpecCli(env.productDir, SPEC_DOMAIN_CLI.COMMAND, SPEC_DOMAIN_CLI.STATUS_COMMAND);
      expect(result.exitCode).toBe(0);
      // The spec's observable is each node's id and derived state reaching
      // the caller, not the private row shape the renderer composes.
      const expectedRows = specCliDeclaredStatusRows(env.fixture);
      expect(result.stdout.split("\n")).toHaveLength(expectedRows.length);
      for (const row of expectedRows) {
        expect(result.stdout).toContain(row.nodeId);
        expect(result.stdout).toContain(row.state);
      }
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
      // The spec's observable is each node's id and derived state reaching
      // the caller, not the private row shape the renderer composes.
      const expectedRows = specCliDeclaredStatusRows(env.fixture);
      expect(result.stdout.split("\n")).toHaveLength(expectedRows.length);
      for (const row of expectedRows) {
        expect(result.stdout).toContain(row.nodeId);
        expect(result.stdout).toContain(row.state);
      }
    });
  });

  it("routes next through the packaged executable", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const result = await runSpecCli(env.productDir, SPEC_DOMAIN_CLI.COMMAND, SPEC_DOMAIN_CLI.NEXT_COMMAND);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(SPEC_NEXT_MESSAGE.HEADING);
      // The selected node is the root itself: its directory is named, and its
      // child's directory — whose path also carries the root's — is not.
      expect(result.stdout).toContain(specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root));
      expect(result.stdout).not.toContain(specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.child));
    });
  });

  it("routes context list through the packaged executable as the structural manifest command", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const target = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);
      const execution = await runSpecCliWithIsolation(
        env.productDir,
        SPEC_DOMAIN_CLI.COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_LIST_COMMAND,
        target,
        SPEC_DOMAIN_CLI.JSON_OPTION,
      );
      expect(execution.result.exitCode, execution.result.stderr).toBe(0);
      const manifest = parseContextManifest(execution.result.stdout);
      expect(manifest.schemaVersion).toBe(SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION);
      // The manifest names the resolved product directory, so the in-process
      // oracle runs from the same resolved path the executable resolved.
      expect(manifest).toEqual(await contextListManifest({ targets: [target], cwd: execution.productDirectory }));
    });
  });

  it("rejects the retired --content option on show before any output", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const target = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);
      const result = await runSpecCli(
        env.productDir,
        SPEC_DOMAIN_CLI.COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_SHOW_COMMAND,
        target,
        RETIRED_SPEC_CONTEXT_CONTENT_FIXTURE.option,
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(RETIRED_SPEC_CONTEXT_CONTENT_FIXTURE.option);
      expect(result.stdout).toHaveLength(0);
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
      // The diagnostic names the rejected token and every accepted format;
      // its sentence shape belongs to the descriptor, not to this evidence.
      for (const named of fixture.namedValues) expect(result.stderr).toContain(named);
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
      expect(result.stdout).toHaveLength(0);
      expect(result.stderr).toContain(RETIRED_SPEC_APPLY_FIXTURE.command);
      await expect(Promise.all(fixture.protectedPaths.map((path) => env.readFile(path)))).resolves.toEqual(before);
    });
  });
});
