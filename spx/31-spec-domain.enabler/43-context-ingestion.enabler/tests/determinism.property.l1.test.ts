import { describe, expect, it } from "vitest";

import { TEST_ENVIRONMENT_GENERATOR } from "@testing/generators/test-environment/test-environment";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextCommand,
  contextTextCommand,
  methodologyPackageConfig,
  rootedSpecPath,
  specTreeKindsConfig,
  writeMethodologyPackage,
} from "@testing/harnesses/spec/context";

describe("spec context determinism", () => {
  it("produces byte-identical machine output across repeated runs on identical tree content and methodology resources", async () => {
    await assertProperty(
      TEST_ENVIRONMENT_GENERATOR.contextDeterminismCase(specTreeKindsConfig()),
      async ({ extraNodeDirectory, extraDecisionFile }) => {
        await withSpecTreeEnv(methodologyPackageConfig(), async (env) => {
          await env.materialize();
          await writeMethodologyPackage(env);
          await env.writeRaw(rootedSpecPath(`${extraNodeDirectory}/extra.md`), "# Extra node\n");
          await env.writeRaw(rootedSpecPath(extraDecisionFile), "# Extra decision\n");
          const snapshot = await env.readFilesystemSnapshot();
          const target = snapshot.allNodes[0];
          const targets = [target.id];
          const firstJson = await contextCommand({ targets, cwd: env.productDir });
          const secondJson = await contextCommand({ targets, cwd: env.productDir });
          const firstText = await contextTextCommand({ targets, cwd: env.productDir });
          const secondText = await contextTextCommand({ targets, cwd: env.productDir });
          const firstContent = await contextCommand({ targets, cwd: env.productDir, content: true });
          const secondContent = await contextCommand({ targets, cwd: env.productDir, content: true });
          const firstUnderstand = await contextCommand({ targets, cwd: env.productDir, understand: true });
          const secondUnderstand = await contextCommand({ targets, cwd: env.productDir, understand: true });
          expect(secondJson).toBe(firstJson);
          expect(secondText).toBe(firstText);
          expect(secondContent).toBe(firstContent);
          expect(secondUnderstand).toBe(firstUnderstand);
        });
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
