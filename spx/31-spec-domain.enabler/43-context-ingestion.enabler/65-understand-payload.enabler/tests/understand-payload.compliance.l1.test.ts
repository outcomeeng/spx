import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { METHODOLOGY_CONFIG_FIELDS } from "@/config/methodology";
import { SPEC_CONTEXT_DIGEST_ALGORITHM } from "@/lib/spec-tree";
import {
  generatedMethodologySection,
  generatedMigratingMethodologySection,
} from "@testing/generators/config/descriptors";
import {
  arbitraryMethodologyVersion,
  generatedSourceRecordProviding,
  supportsRangeContaining,
  supportsRangeExcluding,
} from "@testing/generators/methodology/tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextCommand,
  contextCommandFailure,
  methodologyTreeConfig,
  parseContextManifest,
  writeMethodologyTree,
} from "@testing/harnesses/spec/context";

describe("spec context understand payload provider match", () => {
  it("fails naming both declarations when the recorded provides differs, fails naming the migration source and the range when it falls outside supports, and serves the tree when both agree", async () => {
    const migrating = generatedMigratingMethodologySection();
    const version = migrating[METHODOLOGY_CONFIG_FIELDS.VERSION] as string;
    const migratingFrom = migrating[METHODOLOGY_CONFIG_FIELDS.MIGRATING_FROM] as string;
    const other = sampleGeneratedValue(arbitraryMethodologyVersion().filter((candidate) => candidate.text !== version));
    await withSpecTreeEnv(methodologyTreeConfig(migrating), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];

      const providesOther = await writeMethodologyTree(env, {
        version,
        sourceRecord: generatedSourceRecordProviding(other.text),
      });
      const mismatch = await contextCommandFailure({
        targets: [target.id],
        cwd: env.productDir,
        understand: true,
        methodologyTreeRoot: providesOther.treeRoot,
      });
      expect(mismatch).toContain(version);
      expect(mismatch).toContain(other.text);

      const excluding = supportsRangeExcluding(migratingFrom);
      const outsideSupports = await writeMethodologyTree(env, {
        version,
        sourceRecord: generatedSourceRecordProviding(version, excluding),
      });
      const outside = await contextCommandFailure({
        targets: [target.id],
        cwd: env.productDir,
        understand: true,
        methodologyTreeRoot: outsideSupports.treeRoot,
      });
      expect(outside).toContain(migratingFrom);
      expect(outside).toContain(excluding);

      const agreeing = await writeMethodologyTree(env, {
        version,
        sourceRecord: generatedSourceRecordProviding(version, supportsRangeContaining(migratingFrom)),
      });
      const manifest = parseContextManifest(
        await contextCommand({
          targets: [target.id],
          cwd: env.productDir,
          understand: true,
          methodologyTreeRoot: agreeing.treeRoot,
        }),
      );
      expect(manifest.read.at(-1)?.content).toBe(agreeing.coreText);
    });
  });
});

describe("spec context understand payload sourcing", () => {
  it("always sources foundation bodies from the shipped tree's manifest resources stamped with the configured methodology identity", async () => {
    // Two runs over two different shipped core bodies: the emitted body,
    // digest, and byte count track the shipped resource bytes exactly, so
    // no embedded snapshot can be the source.
    const identity = generatedMethodologySection();
    const firstBody = `# Foundation body A — ${sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug())}\n`;
    const secondBody = `# Foundation body B — ${sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug())}\n`;
    for (const coreText of [firstBody, secondBody]) {
      await withSpecTreeEnv(methodologyTreeConfig(identity), async (env) => {
        await env.materialize();
        const fixture = await writeMethodologyTree(env, {
          coreText,
          version: identity[METHODOLOGY_CONFIG_FIELDS.VERSION] as string,
        });
        const snapshot = await env.readFilesystemSnapshot();
        const target = snapshot.allNodes[0];

        const manifest = parseContextManifest(
          await contextCommand({
            targets: [target.id],
            cwd: env.productDir,
            understand: true,
            methodologyTreeRoot: fixture.treeRoot,
          }),
        );
        const entry = manifest.read.find((document) => document.path === fixture.corePath);
        expect(entry?.content).toBe(coreText);
        expect(entry?.digest).toBe(
          `${SPEC_CONTEXT_DIGEST_ALGORITHM}:${
            createHash(SPEC_CONTEXT_DIGEST_ALGORITHM).update(coreText).digest("hex")
          }`,
        );
        expect(entry?.bytes).toBe(Buffer.byteLength(coreText));
        expect(manifest.methodology).toEqual({
          source: identity[METHODOLOGY_CONFIG_FIELDS.SOURCE],
          version: identity[METHODOLOGY_CONFIG_FIELDS.VERSION],
        });
      });
    }
  });
});
