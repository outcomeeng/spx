import { describe, expect, it } from "vitest";

import { SPEC_NEXT_MESSAGE } from "@/commands/spec/next";
import { METHODOLOGY_CONFIG_FIELDS } from "@/config/methodology";
import { SPEC_DOMAIN_CLI } from "@/interfaces/cli/spec";
import { METHODOLOGY_CODING_AGENT } from "@/lib/methodology";
import { KIND_REGISTRY, SPEC_CONTEXT_ENTRY_TYPE, SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION } from "@/lib/spec-tree";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import {
  RETIRED_SPEC_CONTEXT_CONTENT_FIXTURE,
  specCliApplyProtectionFixture,
  specCliDeclaredStatusRows,
  specCliUnsupportedStatusFormatFixture,
} from "@testing/generators/spec-tree/spec-cli";
import { RETIRED_SPEC_APPLY_FIXTURE, specTreeFixtureNodeDirectoryName } from "@testing/generators/spec-tree/spec-tree";
import { shippedFoundationCoreBody, shippedMethodologyVersion } from "@testing/harnesses/methodology/shipped-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextListManifest,
  entryPaths,
  methodologyTreeConfig,
  parseContextEntries,
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
      expect(result.stdout).toContain(env.fixture.root.slug);
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
      expect(result.stderr).toContain(RETIRED_SPEC_CONTEXT_CONTENT_FIXTURE.unknownOptionPrefix);
      expect(result.stderr).toContain(RETIRED_SPEC_CONTEXT_CONTENT_FIXTURE.option);
      expect(result.stdout).toHaveLength(0);
    });
  });

  it("accepts loaded declarations and suppresses only entries covered at a sufficient mode", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);
      const targetSpecPath = snapshot.allNodes.find((node) => node.id === target)?.ref?.path;
      // A target declared loaded is fully covered, so nothing remains in either representation.
      const covered = await runSpecCli(
        env.productDir,
        SPEC_DOMAIN_CLI.COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_SHOW_COMMAND,
        target,
        SPEC_DOMAIN_CLI.LOADED_TARGET_OPTION,
        target,
        SPEC_DOMAIN_CLI.JSON_OPTION,
      );
      expect(covered.exitCode, covered.stderr).toBe(0);
      expect(parseContextEntries(covered.stdout)).toEqual([]);
      const coveredText = await runSpecCli(
        env.productDir,
        SPEC_DOMAIN_CLI.COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_SHOW_COMMAND,
        target,
        SPEC_DOMAIN_CLI.LOADED_TARGET_OPTION,
        target,
      );
      expect(coveredText.exitCode, coveredText.stderr).toBe(0);
      expect(coveredText.stdout).toHaveLength(0);
      // The loaded product projection covers the product spec in Full and the
      // top-level target only as a Digest, so the product spec is suppressed
      // while the target's Full document is still emitted.
      const partial = await runSpecCli(
        env.productDir,
        SPEC_DOMAIN_CLI.COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_SHOW_COMMAND,
        target,
        SPEC_DOMAIN_CLI.LOADED_PRODUCT_OPTION,
        SPEC_DOMAIN_CLI.JSON_OPTION,
      );
      expect(partial.exitCode, partial.stderr).toBe(0);
      const remaining = entryPaths(parseContextEntries(partial.stdout));
      expect(remaining).not.toContain(snapshot.product?.ref?.path);
      expect(remaining).toContain(targetSpecPath);
    });
  });

  it("rejects incompatible methodology flags and accepts --methodology beside --loaded-product", async () => {
    const shipped = await shippedMethodologyVersion();
    await withSpecTreeEnv(
      methodologyTreeConfig({ [METHODOLOGY_CONFIG_FIELDS.VERSION]: shipped.text }),
      async (env) => {
        await env.materialize();
        const snapshot = await env.readFilesystemSnapshot();
        const target = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);
        const exclusive = await runSpecCli(
          env.productDir,
          SPEC_DOMAIN_CLI.COMMAND,
          SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
          SPEC_DOMAIN_CLI.CONTEXT_SHOW_COMMAND,
          target,
          SPEC_DOMAIN_CLI.METHODOLOGY_OPTION,
          SPEC_DOMAIN_CLI.LOADED_METHODOLOGY_OPTION,
        );
        expect(exclusive.exitCode).toBe(1);
        expect(exclusive.stderr).toContain(SPEC_DOMAIN_CLI.METHODOLOGY_OPTION);
        expect(exclusive.stderr).toContain(SPEC_DOMAIN_CLI.LOADED_METHODOLOGY_OPTION);
        expect(exclusive.stdout).toHaveLength(0);
        const valid = await runSpecCli(
          env.productDir,
          SPEC_DOMAIN_CLI.COMMAND,
          SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
          SPEC_DOMAIN_CLI.CONTEXT_SHOW_COMMAND,
          target,
          SPEC_DOMAIN_CLI.METHODOLOGY_OPTION,
          SPEC_DOMAIN_CLI.LOADED_PRODUCT_OPTION,
          SPEC_DOMAIN_CLI.CODING_AGENT_OPTION,
          METHODOLOGY_CODING_AGENT.CLAUDE,
          SPEC_DOMAIN_CLI.JSON_OPTION,
        );
        expect(valid.exitCode, valid.stderr).toBe(0);
        const entries = parseContextEntries(valid.stdout);
        const foundation = entries[0];
        expect(foundation?.type === SPEC_CONTEXT_ENTRY_TYPE.DOCUMENT ? foundation.content : undefined).toBe(
          await shippedFoundationCoreBody(shipped.line, METHODOLOGY_CODING_AGENT.CLAUDE),
        );
        expect(entryPaths(entries)).not.toContain(snapshot.product?.ref?.path);
      },
    );
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
      expect(result.stderr).toContain(RETIRED_SPEC_APPLY_FIXTURE.unknownCommandPrefix);
      expect(result.stderr).toContain(RETIRED_SPEC_APPLY_FIXTURE.command);
      await expect(Promise.all(fixture.protectedPaths.map((path) => env.readFile(path)))).resolves.toEqual(before);
    });
  });
});
