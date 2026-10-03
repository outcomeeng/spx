import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { METHODOLOGY_CONFIG_FIELDS } from "@/config/methodology";
import { SPEC_CONTEXT_COMMAND_PATH, SPEC_DOMAIN_CLI } from "@/interfaces/cli/spec";
import { SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX } from "@/interfaces/cli/spec-context-contract";
import { METHODOLOGY_CODING_AGENT } from "@/lib/methodology";
import { KIND_REGISTRY, SPEC_CONTEXT_TARGET_FAILURE_KIND } from "@/lib/spec-tree";
import { arbitraryMethodologyVersion } from "@testing/generators/methodology/tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  arbitrarySpecContextInvalidUtf8Bytes,
  specContextUnknownTarget,
} from "@testing/generators/spec-tree/context-target";
import { rootedSpecPath } from "@testing/generators/spec-tree/rich-context";
import {
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
  specTreeFixtureNodeDirectoryName,
} from "@testing/generators/spec-tree/spec-tree";
import { shippedMethodologyVersion } from "@testing/harnesses/methodology/shipped-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  methodologyTreeConfig,
  runSpecCli,
  specTreeKindsConfig,
  withRichContextEnv,
} from "@testing/harnesses/spec/context";

describe("spec context no partial output", () => {
  it("writes nothing to standard output when one target of a list or show fails to resolve, and the complete output when every target resolves", async () => {
    await withRichContextEnv(async (env, paths) => {
      const unknown = specContextUnknownTarget(env.fixture);
      for (const command of [SPEC_CONTEXT_COMMAND_PATH.LIST, SPEC_CONTEXT_COMMAND_PATH.SHOW]) {
        const result = await runSpecCli(env.productDir, ...command, paths.targetId, unknown);
        expect(result.exitCode, command.join(" ")).toBe(1);
        expect(result.stdout, command.join(" ")).toHaveLength(0);
        expect(result.stderr).toContain(
          SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[SPEC_CONTEXT_TARGET_FAILURE_KIND.UNRESOLVED],
        );
        expect(result.stderr).toContain(unknown);
        // The same executable over the resolvable target alone writes its
        // output, so the empty stream above is the failure's doing.
        const resolved = await runSpecCli(env.productDir, ...command, paths.targetId);
        expect(resolved.exitCode, resolved.stderr).toBe(0);
        expect(resolved.stdout).toContain(paths.targetSpecPath);
      }
    });
  });

  it("writes nothing to standard output when a selected document's source cannot be read", async () => {
    await withRichContextEnv(async (env, paths) => {
      await writeFile(
        join(env.productDir, paths.targetSpecPath),
        Buffer.from(sampleSpecTreeTestValue(arbitrarySpecContextInvalidUtf8Bytes())),
      );
      const result = await runSpecCli(
        env.productDir,
        SPEC_DOMAIN_CLI.COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_SHOW_COMMAND,
        paths.targetId,
      );
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toHaveLength(0);
      expect(result.stderr).toContain(paths.targetSpecPath);
    });
  });

  it("writes nothing to standard output when a selected document cites a decision no tracked path satisfies", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const targetSpecPath = target.ref?.path;
      if (targetSpecPath === undefined) throw new Error("Expected the fixture target to expose a spec path");
      const missing = rootedSpecPath(
        `${target.id}/${target.order + 1}-${sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug())}${
          KIND_REGISTRY[env.fixture.decision.kind].suffix
        }`,
      );
      await env.writeRaw(
        targetSpecPath,
        `# ${target.slug}\n\n${
          KIND_REGISTRY[target.kind].opening
        } a governed node\n\nGoverned by [absent](${missing}).\n`,
      );
      const result = await runSpecCli(
        env.productDir,
        SPEC_DOMAIN_CLI.COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_SHOW_COMMAND,
        target.id,
      );
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toHaveLength(0);
      expect(result.stderr).toContain(missing);
      expect(result.stderr).toContain(targetSpecPath);
    });
  });

  it("writes nothing to standard output when the methodology foundation cannot be served", async () => {
    // The declared line is drawn off the shipped line, so the methodology
    // document fails after the product entries were already resolvable.
    const shipped = await shippedMethodologyVersion();
    const declared = sampleGeneratedValue(
      arbitraryMethodologyVersion().filter((candidate) => candidate.line !== shipped.line),
    );
    await withSpecTreeEnv(
      methodologyTreeConfig({ [METHODOLOGY_CONFIG_FIELDS.VERSION]: declared.text }),
      async (env) => {
        await env.materialize();
        const target = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);
        const result = await runSpecCli(
          env.productDir,
          SPEC_DOMAIN_CLI.COMMAND,
          SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
          SPEC_DOMAIN_CLI.CONTEXT_SHOW_COMMAND,
          target,
          SPEC_DOMAIN_CLI.METHODOLOGY_OPTION,
          SPEC_DOMAIN_CLI.CODING_AGENT_OPTION,
          METHODOLOGY_CODING_AGENT.CLAUDE,
        );
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toHaveLength(0);
        expect(result.stderr).toContain(declared.text);
      },
    );
  });
});
