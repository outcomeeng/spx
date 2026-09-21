import { describe, expect, it } from "vitest";

import { METHODOLOGY_CONFIG_FIELDS } from "@/config/methodology";
import { SPEC_DOMAIN_CLI } from "@/interfaces/cli/spec";
import { KIND_REGISTRY, SPEC_CONTEXT_ENTRY_TYPE } from "@/lib/spec-tree";
import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { specContextCodingAgentMarkerCases } from "@testing/generators/spec-tree/context-target";
import { specTreeFixtureNodeDirectoryName } from "@testing/generators/spec-tree/spec-tree";
import { shippedFoundationCoreBody, shippedMethodologyVersion } from "@testing/harnesses/methodology/shipped-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  methodologyTreeConfig,
  parseContextEntries,
  runSpecCliWithIsolationInEnv,
} from "@testing/harnesses/spec/context";

describe("spec context coding-agent scope through the packaged executable", () => {
  it("maps every marker subset that names an agent, with no --coding-agent option, to that agent's shipped tree", async () => {
    const shipped = await shippedMethodologyVersion();
    const cases = specContextCodingAgentMarkerCases(sampleGeneratedValue(arbitraryPathSegment()));
    await withSpecTreeEnv(
      methodologyTreeConfig({ [METHODOLOGY_CONFIG_FIELDS.VERSION]: shipped.text }),
      async (env) => {
        await env.materialize();
        const target = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);
        for (const { markers, expected } of cases) {
          if (expected === undefined) continue;
          const execution = await runSpecCliWithIsolationInEnv(
            env.productDir,
            markers,
            SPEC_DOMAIN_CLI.COMMAND,
            SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
            SPEC_DOMAIN_CLI.CONTEXT_SHOW_COMMAND,
            target,
            SPEC_DOMAIN_CLI.JSON_OPTION,
            SPEC_DOMAIN_CLI.METHODOLOGY_OPTION,
          );
          expect(execution.result.exitCode, execution.result.stderr).toBe(0);
          const foundation = parseContextEntries(execution.result.stdout)[0];
          expect(
            foundation?.type === SPEC_CONTEXT_ENTRY_TYPE.DOCUMENT ? foundation.content : undefined,
            JSON.stringify(markers),
          ).toBe(await shippedFoundationCoreBody(shipped.line, expected));
        }
      },
    );
  });
});
