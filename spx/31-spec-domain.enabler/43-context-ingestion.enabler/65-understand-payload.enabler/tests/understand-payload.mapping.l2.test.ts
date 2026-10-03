import { describe, expect, it } from "vitest";

import { METHODOLOGY_CONFIG_FIELDS } from "@/config/methodology";
import { SPEC_DOMAIN_CLI } from "@/interfaces/cli/spec";
import { METHODOLOGY_CODING_AGENTS } from "@/lib/methodology";
import { KIND_REGISTRY, SPEC_CONTEXT_ENTRY_TYPE } from "@/lib/spec-tree";
import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  SPEC_CONTEXT_CASE_TITLE,
  specContextCodingAgentWitnessCases,
} from "@testing/generators/spec-tree/context-target";
import { specTreeFixtureNodeDirectoryName } from "@testing/generators/spec-tree/spec-tree";
import { shippedFoundationCoreBody, shippedMethodologyVersion } from "@testing/harnesses/methodology/shipped-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  methodologyTreeConfig,
  parseContextEntries,
  runSpecCliWithIsolationInEnv,
} from "@testing/harnesses/spec/context";

describe("spec context coding-agent scope through the packaged executable", () => {
  it.each(specContextCodingAgentWitnessCases(sampleGeneratedValue(arbitraryPathSegment())))(
    SPEC_CONTEXT_CASE_TITLE,
    async ({ markers, expected }) => {
      const shipped = await shippedMethodologyVersion();
      await withSpecTreeEnv(
        methodologyTreeConfig({ [METHODOLOGY_CONFIG_FIELDS.VERSION]: shipped.text }),
        async (env) => {
          await env.materialize();
          const target = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);
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
        },
      );
    },
  );

  it.each(specContextCodingAgentWitnessCases(sampleGeneratedValue(arbitraryPathSegment())))(
    "selects the agent --coding-agent names over invocation markers that name another: $title",
    async ({ markers, expected }) => {
      const shipped = await shippedMethodologyVersion();
      // Every other shipped agent is named against markers that select
      // `expected`, so a flag that yielded to the markers serves the wrong tree.
      const named = METHODOLOGY_CODING_AGENTS.filter((agent) => agent !== expected);
      expect(named.length).toBeGreaterThan(0);
      await withSpecTreeEnv(
        methodologyTreeConfig({ [METHODOLOGY_CONFIG_FIELDS.VERSION]: shipped.text }),
        async (env) => {
          await env.materialize();
          const target = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);
          for (const agent of named) {
            const execution = await runSpecCliWithIsolationInEnv(
              env.productDir,
              markers,
              SPEC_DOMAIN_CLI.COMMAND,
              SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
              SPEC_DOMAIN_CLI.CONTEXT_SHOW_COMMAND,
              target,
              SPEC_DOMAIN_CLI.JSON_OPTION,
              SPEC_DOMAIN_CLI.METHODOLOGY_OPTION,
              SPEC_DOMAIN_CLI.CODING_AGENT_OPTION,
              agent,
            );
            expect(execution.result.exitCode, execution.result.stderr).toBe(0);
            const foundation = parseContextEntries(execution.result.stdout)[0];
            const served = foundation?.type === SPEC_CONTEXT_ENTRY_TYPE.DOCUMENT ? foundation.content : undefined;
            expect(served, agent).toBe(await shippedFoundationCoreBody(shipped.line, agent));
            expect(served, agent).not.toBe(await shippedFoundationCoreBody(shipped.line, expected));
          }
        },
      );
    },
  );
});
