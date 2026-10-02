import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION } from "@/config/methodology";
import { LEGACY_METHODOLOGY_CONFIG_SECTION } from "@/config/methodology-placement";
import { SPEC_CONTEXT_COMMAND_PATH, SPEC_DOMAIN_CLI } from "@/interfaces/cli/spec";
import { SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX } from "@/interfaces/cli/spec-context-contract";
import { SPEC_CONTEXT_MISSING_PRODUCT_SPEC_ERROR, SPEC_CONTEXT_TARGET_FAILURE_KIND } from "@/lib/spec-tree";
import {
  CONFIG_TEST_GENERATOR,
  generatedHarnessMethodologyConfig,
  generatedInvalidMethodologyConfigs,
  generatedMethodologySection,
  sampleConfigTestValue,
} from "@testing/generators/config/descriptors";
import { arbitraryMethodologyVersion } from "@testing/generators/methodology/tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  arbitrarySpecContextInvalidUtf8Bytes,
  specContextAbsentDecisionPath,
  specContextUnknownTarget,
} from "@testing/generators/spec-tree/context-target";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  METHODOLOGY_FIXTURE_IDENTITY,
  methodologyTreeConfig,
  runSpecDescriptor,
  specTreeKindsConfig,
  withEmptyContextTreeEnv,
  withProductlessContextTreeEnv,
  withRichContextEnv,
  writeMethodologyTree,
} from "@testing/harnesses/spec/context";

describe("spec context ingestion writes nothing to standard output after a failure", () => {
  it("writes no list or show output when one requested target fails to resolve, and the complete output when every target resolves", async () => {
    await withRichContextEnv(async (env, paths) => {
      const unknown = specContextUnknownTarget(env.fixture);
      for (const command of [SPEC_CONTEXT_COMMAND_PATH.LIST, SPEC_CONTEXT_COMMAND_PATH.SHOW]) {
        const failed = await runSpecDescriptor({ productDir: env.productDir }, ...command, paths.targetId, unknown);
        expect(failed.stdout, command.join(" ")).toHaveLength(0);
        expect(failed.exitCode, command.join(" ")).toBe(1);
        expect(failed.stderr).toContain(
          SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[SPEC_CONTEXT_TARGET_FAILURE_KIND.UNRESOLVED],
        );
        expect(failed.stderr).toContain(unknown);
        // The same command over the resolvable target alone writes its output,
        // so the empty stream above is the failure's doing.
        const resolved = await runSpecDescriptor({ productDir: env.productDir }, ...command, paths.targetId);
        expect(resolved.exitCode, resolved.stderr).toBeUndefined();
        expect(resolved.stdout).toContain(paths.targetSpecPath);
      }
    });
  });

  it("writes no list or show output, targeted or targetless, when the tree holds a node and a root decision but no product spec", async () => {
    await withProductlessContextTreeEnv(specTreeKindsConfig(), async (env, paths) => {
      for (
        const argv of [
          SPEC_CONTEXT_COMMAND_PATH.SHOW,
          [...SPEC_CONTEXT_COMMAND_PATH.SHOW, paths.nodeTargetPath],
          [...SPEC_CONTEXT_COMMAND_PATH.LIST, paths.nodeTargetPath],
        ]
      ) {
        const run = await runSpecDescriptor({ productDir: env.productDir }, ...argv);
        expect(run.stdout, argv.join(" ")).toHaveLength(0);
        expect(run.exitCode, argv.join(" ")).toBe(1);
        expect(run.stderr, argv.join(" ")).toContain(SPEC_CONTEXT_MISSING_PRODUCT_SPEC_ERROR);
      }
    });
    // The same targetless show over a tree holding no product spec, node, or
    // decision succeeds, so the failure above is the nodes' and decision's doing.
    await withEmptyContextTreeEnv(specTreeKindsConfig(), async (env) => {
      const run = await runSpecDescriptor({ productDir: env.productDir }, ...SPEC_CONTEXT_COMMAND_PATH.SHOW);
      expect(run.exitCode, run.stderr).toBeUndefined();
      expect(run.stderr).not.toContain(SPEC_CONTEXT_MISSING_PRODUCT_SPEC_ERROR);
    });
  });

  it("writes no show output when a selected document's source is not strict UTF-8", async () => {
    await withRichContextEnv(async (env, paths) => {
      await writeFile(
        join(env.productDir, paths.higherIndexSiblingSpecPath),
        Buffer.from(sampleGeneratedValue(arbitrarySpecContextInvalidUtf8Bytes())),
      );
      const run = await runSpecDescriptor(
        { productDir: env.productDir },
        ...SPEC_CONTEXT_COMMAND_PATH.SHOW,
        paths.targetId,
      );
      expect(run.stdout).toHaveLength(0);
      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain(paths.higherIndexSiblingSpecPath);
    });
  });

  it("writes no show output when a selected document cannot be read", async () => {
    await withRichContextEnv(async (env, paths) => {
      // Removing every permission bit makes the read fail on POSIX non-root
      // runners; restored afterwards so temp-directory cleanup stays quiet.
      await chmod(join(env.productDir, paths.rootSpecPath), 0o000);
      try {
        const run = await runSpecDescriptor(
          { productDir: env.productDir },
          ...SPEC_CONTEXT_COMMAND_PATH.SHOW,
          paths.targetId,
        );
        expect(run.stdout).toHaveLength(0);
        expect(run.exitCode).toBe(1);
        expect(run.stderr).toContain(paths.rootSpecPath);
      } finally {
        await chmod(join(env.productDir, paths.rootSpecPath), 0o644);
      }
    });
  });

  it("writes no show output when a selected document cites a decision no tracked path satisfies", async () => {
    await withRichContextEnv(async (env, paths) => {
      const missing = specContextAbsentDecisionPath(env.fixture, paths.targetId);
      await env.writeRaw(
        paths.targetSpecPath,
        `${paths.sourceText[paths.targetSpecPath]}\nGoverned by [absent](${missing}).\n`,
      );
      const run = await runSpecDescriptor(
        { productDir: env.productDir },
        ...SPEC_CONTEXT_COMMAND_PATH.SHOW,
        paths.targetId,
      );
      expect(run.stdout).toHaveLength(0);
      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain(missing);
      expect(run.stderr).toContain(paths.targetSpecPath);
    });
  });

  it("writes no list or show output when the methodology declaration is malformed, naming the field", async () => {
    for (const invalid of generatedInvalidMethodologyConfigs()) {
      await withSpecTreeEnv({ ...specTreeKindsConfig(), ...invalid.config }, async (env) => {
        await env.materialize();
        const target = (await env.readFilesystemSnapshot()).allNodes[0].id;
        for (const command of [SPEC_CONTEXT_COMMAND_PATH.LIST, SPEC_CONTEXT_COMMAND_PATH.SHOW]) {
          const run = await runSpecDescriptor({ productDir: env.productDir }, ...command, target);
          expect(run.stdout, `${invalid.field} ${command.join(" ")}`).toHaveLength(0);
          expect(run.exitCode, invalid.field).toBe(1);
          expect(run.stderr, invalid.field).toContain(invalid.field);
        }
      });
    }
  });

  // The two cases below witness the context commands' wiring to the shared
  // methodology resolver, whose own rules the methodology-config node owns:
  // a refactor of this command's config path can neither drop the
  // legacy-placement rejection nor start failing on unrelated config content.
  it("writes no list or show output when the methodology declaration sits in the retired harness placement", async () => {
    await withSpecTreeEnv({ ...specTreeKindsConfig(), ...generatedHarnessMethodologyConfig() }, async (env) => {
      await env.materialize();
      const target = (await env.readFilesystemSnapshot()).allNodes[0].id;
      for (const command of [SPEC_CONTEXT_COMMAND_PATH.LIST, SPEC_CONTEXT_COMMAND_PATH.SHOW]) {
        const run = await runSpecDescriptor({ productDir: env.productDir }, ...command, target);
        expect(run.stdout, command.join(" ")).toHaveLength(0);
        expect(run.exitCode).toBe(1);
        expect(run.stderr).toContain(`${LEGACY_METHODOLOGY_CONFIG_SECTION}.${METHODOLOGY_SECTION}`);
      }
    });
  });

  it("writes the complete list output when only unrelated harness config is defective", async () => {
    const methodology = generatedMethodologySection();
    await withSpecTreeEnv({
      ...specTreeKindsConfig(),
      [METHODOLOGY_SECTION]: methodology,
      [LEGACY_METHODOLOGY_CONFIG_SECTION]: {
        [sampleConfigTestValue(CONFIG_TEST_GENERATOR.key())]: generatedMethodologySection(),
      },
    }, async (env) => {
      await env.materialize();
      const target = (await env.readFilesystemSnapshot()).allNodes[0].id;
      const run = await runSpecDescriptor({ productDir: env.productDir }, ...SPEC_CONTEXT_COMMAND_PATH.LIST, target);
      expect(run.exitCode, run.stderr).toBeUndefined();
      expect(run.stdout).toContain(String(methodology[METHODOLOGY_CONFIG_FIELDS.VERSION]));
    });
  });

  it("writes no show output when the methodology foundation cannot be served after the product entries resolve", async () => {
    // The shipped fixture tree serves another line than the declared one, so
    // only the methodology document fails while every product entry resolves.
    const declared = sampleGeneratedValue(
      arbitraryMethodologyVersion().filter((candidate) => candidate.line !== METHODOLOGY_FIXTURE_IDENTITY.line),
    );
    await withSpecTreeEnv(
      methodologyTreeConfig({ [METHODOLOGY_CONFIG_FIELDS.VERSION]: declared.text }),
      async (env) => {
        await env.materialize();
        const fixture = await writeMethodologyTree(env);
        const target = (await env.readFilesystemSnapshot()).allNodes[0].id;
        const context = { productDir: env.productDir, methodologyTreeRoot: fixture.treeRoot };
        const run = await runSpecDescriptor(
          context,
          ...SPEC_CONTEXT_COMMAND_PATH.SHOW,
          target,
          SPEC_DOMAIN_CLI.METHODOLOGY_OPTION,
          SPEC_DOMAIN_CLI.CODING_AGENT_OPTION,
          fixture.codingAgent,
        );
        expect(run.stdout).toHaveLength(0);
        expect(run.exitCode).toBe(1);
        expect(run.stderr).toContain(declared.text);
        const withoutFoundation = await runSpecDescriptor(context, ...SPEC_CONTEXT_COMMAND_PATH.SHOW, target);
        expect(withoutFoundation.exitCode, withoutFoundation.stderr).toBeUndefined();
        expect(withoutFoundation.stdout.length).toBeGreaterThan(0);
      },
    );
  });
});
