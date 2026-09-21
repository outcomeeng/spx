import { describe, expect, it } from "vitest";

import { METHODOLOGY_CONFIG_FIELDS } from "@/config/methodology";
import { SPEC_DOMAIN_CLI } from "@/interfaces/cli/spec";
import { METHODOLOGY_CODING_AGENT } from "@/lib/methodology";
import { KIND_REGISTRY, SPEC_CONTEXT_ENTRY_TYPE } from "@/lib/spec-tree";
import { specTreeFixtureNodeDirectoryName } from "@testing/generators/spec-tree/spec-tree";
import { shippedFoundationCoreBody, shippedMethodologyVersion } from "@testing/harnesses/methodology/shipped-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { methodologyTreeConfig, parseContextEntries, runSpecCliWithIsolation } from "@testing/harnesses/spec/context";

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
          SPEC_DOMAIN_CLI.METHODOLOGY_OPTION,
          SPEC_DOMAIN_CLI.CODING_AGENT_OPTION,
          METHODOLOGY_CODING_AGENT.CLAUDE,
        );

        expect(execution.result.exitCode, execution.result.stderr).toBe(0);
        expect(execution.networkAttempts).toEqual([]);
        const foundation = parseContextEntries(execution.result.stdout)[0];
        const coreText = await shippedFoundationCoreBody(shipped.line, METHODOLOGY_CODING_AGENT.CLAUDE);
        expect(foundation?.type === SPEC_CONTEXT_ENTRY_TYPE.DOCUMENT ? foundation.content : undefined).toBe(coreText);
      },
    );
  });
});
