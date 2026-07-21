import { describe, expect, it } from "vitest";

import { METHODOLOGY_CONFIG_FIELDS } from "@/config/methodology";
import { specContextDigest } from "@/lib/spec-tree";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { generatedMethodologySection } from "@testing/harnesses/config/methodology";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextCommand,
  methodologyPackageConfig,
  parseContextManifest,
  writeMethodologyPackage,
} from "@testing/harnesses/spec/context";

describe("spec context understand payload sourcing", () => {
  it("always sources foundation bodies from the installed manifest resources stamped with the configured methodology identity", async () => {
    // Two runs over two different installed core bodies: the emitted body,
    // digest, and byte count track the installed resource bytes exactly, so
    // no embedded snapshot can be the source.
    const identity = generatedMethodologySection();
    const firstBody = `# Foundation body A — ${sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug())}\n`;
    const secondBody = `# Foundation body B — ${sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug())}\n`;
    for (const coreText of [firstBody, secondBody]) {
      await withSpecTreeEnv(methodologyPackageConfig(identity), async (env) => {
        await env.materialize();
        const fixture = await writeMethodologyPackage(env, { coreText });
        const snapshot = await env.readFilesystemSnapshot();
        const target = snapshot.allNodes[0];

        const manifest = parseContextManifest(
          await contextCommand({ targets: [target.id], cwd: env.productDir, understand: true }),
        );
        const entry = manifest.read.find((document) => document.path === fixture.corePath);
        expect(entry?.content).toBe(coreText);
        expect(entry?.digest).toBe(specContextDigest(Buffer.from(coreText)));
        expect(entry?.bytes).toBe(Buffer.byteLength(coreText));
        expect(manifest.methodology).toEqual({
          source: identity[METHODOLOGY_CONFIG_FIELDS.SOURCE],
          version: identity[METHODOLOGY_CONFIG_FIELDS.VERSION],
        });
      });
    }
  });
});
