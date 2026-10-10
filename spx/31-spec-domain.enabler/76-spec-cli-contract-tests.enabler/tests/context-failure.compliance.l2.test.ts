import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { METHODOLOGY_CONFIG_FIELDS } from "@/config/methodology";
import { SPEC_CONTEXT_COMMAND_PATH, SPEC_DOMAIN_CLI } from "@/interfaces/cli/spec";
import { SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX } from "@/interfaces/cli/spec-context-contract";
import { formatMethodologyVersionName, METHODOLOGY_CODING_AGENT } from "@/lib/methodology";
import {
  KIND_REGISTRY,
  SPEC_CONTEXT_MISSING_PRODUCT_SPEC_ERROR,
  SPEC_CONTEXT_PRODUCT_ROOT_TARGET,
  SPEC_CONTEXT_TARGET_FAILURE_KIND,
} from "@/lib/spec-tree";
import { arbitraryMethodologyVersion } from "@testing/generators/methodology/tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  arbitrarySpecContextInvalidUtf8Bytes,
  specContextAbsentDecisionPath,
  specContextAmbiguousNestedDirectory,
  specContextUnknownTarget,
} from "@testing/generators/spec-tree/context-target";
import { specTreeFixtureNodeDirectoryName } from "@testing/generators/spec-tree/spec-tree";
import { shippedMethodologyVersion } from "@testing/harnesses/methodology/shipped-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  methodologyTreeConfig,
  runSpecCli,
  specTreeKindsConfig,
  trackSpecTreeInGit,
  withEmptyContextTreeEnv,
  withProductlessContextTreeEnv,
  withRichContextEnv,
} from "@testing/harnesses/spec/context";

describe("spx spec context failures through the packaged executable", () => {
  it("reports a rejected target with its failure kind and operand, exiting non-zero with empty stdout", async () => {
    await withRichContextEnv(async (env, paths) => {
      const unknown = specContextUnknownTarget(env.fixture);
      for (const command of [SPEC_CONTEXT_COMMAND_PATH.LIST, SPEC_CONTEXT_COMMAND_PATH.SHOW]) {
        const run = await runSpecCli(env.productDir, ...command, paths.targetId, unknown);
        expect(run.exitCode, command.join(" ")).toBe(1);
        expect(run.stdout, command.join(" ")).toHaveLength(0);
        expect(run.stderr).toContain(
          SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[SPEC_CONTEXT_TARGET_FAILURE_KIND.UNRESOLVED],
        );
        expect(run.stderr).toContain(unknown);
      }
    });
  });

  it("reports an ambiguous target with its failure kind and every canonical match, exiting non-zero with empty stdout", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const nested = specContextAmbiguousNestedDirectory(env.fixture);
      await env.writeRaw(nested.nestedSpecPath, nested.nestedSpecContent);
      await trackSpecTreeInGit(env);
      const topLevel = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);
      for (const command of [SPEC_CONTEXT_COMMAND_PATH.LIST, SPEC_CONTEXT_COMMAND_PATH.SHOW]) {
        const run = await runSpecCli(env.productDir, ...command, nested.operand);
        expect(run.exitCode, command.join(" ")).toBe(1);
        expect(run.stdout, command.join(" ")).toHaveLength(0);
        expect(run.stderr).toContain(SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[SPEC_CONTEXT_TARGET_FAILURE_KIND.AMBIGUOUS]);
        expect(run.stderr).toContain(nested.nestedTargetPath);
        expect(run.stderr).toContain(topLevel);
      }
    });
  });

  it("reports a product root without a recognized product spec with its failure kind and the product root, exiting non-zero with empty stdout", async () => {
    await withProductlessContextTreeEnv(specTreeKindsConfig(), async (env, paths) => {
      for (
        const argv of [
          SPEC_CONTEXT_COMMAND_PATH.SHOW,
          [...SPEC_CONTEXT_COMMAND_PATH.SHOW, paths.nodeTargetPath],
          [...SPEC_CONTEXT_COMMAND_PATH.LIST, paths.nodeTargetPath],
        ]
      ) {
        const run = await runSpecCli(env.productDir, ...argv);
        expect(run.exitCode, argv.join(" ")).toBe(1);
        expect(run.stdout, argv.join(" ")).toHaveLength(0);
        expect(run.stderr, argv.join(" ")).toContain(SPEC_CONTEXT_MISSING_PRODUCT_SPEC_ERROR);
      }
    });
    await withEmptyContextTreeEnv(specTreeKindsConfig(), async (env) => {
      for (
        const argv of [
          SPEC_CONTEXT_COMMAND_PATH.SHOW,
          [...SPEC_CONTEXT_COMMAND_PATH.LIST, SPEC_CONTEXT_PRODUCT_ROOT_TARGET],
        ]
      ) {
        const run = await runSpecCli(env.productDir, ...argv);
        expect(run.exitCode, argv.join(" ")).toBe(1);
        expect(run.stdout, argv.join(" ")).toHaveLength(0);
        expect(run.stderr, argv.join(" ")).toContain(SPEC_CONTEXT_MISSING_PRODUCT_SPEC_ERROR);
      }
    });
  });

  it("reports a missing selected document with its failure kind and path, exiting non-zero with empty stdout", async () => {
    await withRichContextEnv(async (env, paths) => {
      await trackSpecTreeInGit(env);
      await rm(join(env.productDir, paths.rootSpecPath));
      for (const command of [SPEC_CONTEXT_COMMAND_PATH.LIST, SPEC_CONTEXT_COMMAND_PATH.SHOW]) {
        const run = await runSpecCli(env.productDir, ...command, paths.targetId);
        expect(run.exitCode, command.join(" ")).toBe(1);
        expect(run.stdout, command.join(" ")).toHaveLength(0);
        expect(run.stderr).toContain(paths.rootSpecPath);
      }
    });
  });

  it("reports an unresolved citation with its failure kind, the cited path, and the citing document, exiting non-zero with empty stdout", async () => {
    await withRichContextEnv(async (env, paths) => {
      const missing = specContextAbsentDecisionPath(env.fixture, paths.targetId);
      await env.writeRaw(
        paths.targetSpecPath,
        `${paths.sourceText[paths.targetSpecPath]}\nGoverned by [absent](${missing}).\n`,
      );
      for (const command of [SPEC_CONTEXT_COMMAND_PATH.LIST, SPEC_CONTEXT_COMMAND_PATH.SHOW]) {
        const run = await runSpecCli(env.productDir, ...command, paths.targetId);
        expect(run.exitCode, command.join(" ")).toBe(1);
        expect(run.stdout, command.join(" ")).toHaveLength(0);
        expect(run.stderr).toContain(missing);
        expect(run.stderr).toContain(paths.targetSpecPath);
      }
    });
  });

  it("reports malformed source with its failure kind and the source path, exiting non-zero with empty stdout", async () => {
    await withRichContextEnv(async (env, paths) => {
      await writeFile(
        join(env.productDir, paths.targetSpecPath),
        Buffer.from(sampleGeneratedValue(arbitrarySpecContextInvalidUtf8Bytes())),
      );
      for (const command of [SPEC_CONTEXT_COMMAND_PATH.LIST, SPEC_CONTEXT_COMMAND_PATH.SHOW]) {
        const run = await runSpecCli(env.productDir, ...command, paths.targetId);
        expect(run.exitCode, command.join(" ")).toBe(1);
        expect(run.stdout, command.join(" ")).toHaveLength(0);
        expect(run.stderr).toContain(paths.targetSpecPath);
      }
    });
  });

  it("reports a methodology failure with its failure kind and the methodology version as MAJOR.MINOR, exiting non-zero with empty stdout", async () => {
    const shipped = await shippedMethodologyVersion();
    const declared = sampleGeneratedValue(
      arbitraryMethodologyVersion().filter((candidate) => candidate.line !== shipped.line),
    );
    await withSpecTreeEnv(
      methodologyTreeConfig({ [METHODOLOGY_CONFIG_FIELDS.VERSION]: declared.text }),
      async (env) => {
        await env.materialize();
        const target = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);
        const run = await runSpecCli(
          env.productDir,
          SPEC_DOMAIN_CLI.COMMAND,
          SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
          SPEC_DOMAIN_CLI.CONTEXT_SHOW_COMMAND,
          target,
          SPEC_DOMAIN_CLI.METHODOLOGY_OPTION,
          SPEC_DOMAIN_CLI.CODING_AGENT_OPTION,
          METHODOLOGY_CODING_AGENT.CLAUDE,
        );
        expect(run.exitCode).toBe(1);
        expect(run.stdout).toHaveLength(0);
        expect(run.stderr).toContain(formatMethodologyVersionName(declared.line));
      },
    );
  });
});
