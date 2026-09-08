import { describe, expect, it } from "vitest";

import { METHODOLOGY_CONFIG_FIELDS } from "@/config/methodology";
import { SPEC_DOMAIN_CLI } from "@/interfaces/cli/spec";
import { METHODOLOGY_CODING_AGENT } from "@/lib/methodology/coding-agent";
import { KIND_REGISTRY } from "@/lib/spec-tree";
import { specTreeFixtureNodeDirectoryName } from "@testing/generators/spec-tree/spec-tree";
import { shippedFoundationCoreText, shippedMethodologyVersion } from "@testing/harnesses/methodology/shipped-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { methodologyTreeConfig, parseContextManifest, runSpecCliWithIsolation } from "@testing/harnesses/spec/context";

describe("spec context understand payload network abstinence", () => {
  it("sources the foundation from spx's own shipped tree through the packaged executable with zero outbound network attempts", async () => {
    const shipped = await shippedMethodologyVersion();
    await withSpecTreeEnv(
      methodologyTreeConfig({ [METHODOLOGY_CONFIG_FIELDS.VERSION]: shipped.text }),
      async (env) => {
        await env.materialize();
        const target = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);

        const execution = await runSpecCliWithIsolation(
          env.productDir,
          SPEC_DOMAIN_CLI.COMMAND,
          SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
          SPEC_DOMAIN_CLI.CONTEXT_SHOW_COMMAND,
          target,
          SPEC_DOMAIN_CLI.JSON_OPTION,
          SPEC_DOMAIN_CLI.UNDERSTAND_OPTION,
          SPEC_DOMAIN_CLI.CODING_AGENT_OPTION,
          METHODOLOGY_CODING_AGENT.CLAUDE,
        );

        expect(execution.result.exitCode, execution.result.stderr).toBe(0);
        expect(execution.networkAttempts).toEqual([]);
        const manifest = parseContextManifest(execution.result.stdout);
        const coreText = await shippedFoundationCoreText(shipped.line, METHODOLOGY_CODING_AGENT.CLAUDE);
        expect(manifest.read.at(-1)?.content).toBe(coreText);
      },
    );
  });
});
