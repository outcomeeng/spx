import { describe, expect, it } from "vitest";

import { SPEC_DOMAIN_CLI } from "@/interfaces/cli/spec";
import { specCliContextTargetFixture } from "@testing/generators/spec-tree/spec-cli";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { parseContextManifest, runSpecCli, specTreeKindsConfig } from "@testing/harnesses/spec/context";

describe("spx spec context process contract", () => {
  it("renders canonical context for an abbreviated target with a trailing separator", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes.find((node) => node.parentId !== undefined) ?? snapshot.allNodes[0];
      const fixture = specCliContextTargetFixture(snapshot, target);
      const result = await runSpecCli(
        env.productDir,
        SPEC_DOMAIN_CLI.COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_SHOW_COMMAND,
        fixture.invocationTarget,
        SPEC_DOMAIN_CLI.JSON_OPTION,
      );
      expect(result.exitCode, result.stderr).toBe(0);
      expect(parseContextManifest(result.stdout).targets).toEqual([fixture.expectedTarget]);
    });
  });
});
