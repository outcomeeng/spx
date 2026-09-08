import { describe, expect, it } from "vitest";

import { METHODOLOGY_CONFIG_FIELDS } from "@/config/methodology";
import { HOOK_SESSION_START_ENV } from "@/domains/hooks/session-start";
import { SPEC_DOMAIN_CLI } from "@/interfaces/cli/spec";
import { METHODOLOGY_CODING_AGENT, type MethodologyCodingAgent } from "@/lib/methodology";
import { KIND_REGISTRY } from "@/lib/spec-tree";
import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { specTreeFixtureNodeDirectoryName } from "@testing/generators/spec-tree/spec-tree";
import { shippedFoundationCoreText, shippedMethodologyVersion } from "@testing/harnesses/methodology/shipped-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  methodologyTreeConfig,
  parseContextManifest,
  runSpecCliWithIsolationInEnv,
} from "@testing/harnesses/spec/context";

describe("spec context coding-agent scope through the packaged executable", () => {
  it("maps each invocation marker, with no --coding-agent option, to that agent's shipped tree", async () => {
    const shipped = await shippedMethodologyVersion();
    const marker = sampleGeneratedValue(arbitraryPathSegment());
    // The precedence the harness-environment descriptor declares: the Codex
    // thread marker selects Codex even beside a Claude Code marker; either
    // Claude Code marker alone selects Claude Code.
    const rows: readonly (readonly [Readonly<Record<string, string>>, MethodologyCodingAgent])[] = [
      [{ [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: marker }, METHODOLOGY_CODING_AGENT.CODEX],
      [{ [HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID]: marker }, METHODOLOGY_CODING_AGENT.CLAUDE],
      [{ [HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE]: marker }, METHODOLOGY_CODING_AGENT.CLAUDE],
      [
        { [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: marker, [HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID]: marker },
        METHODOLOGY_CODING_AGENT.CODEX,
      ],
    ];
    await withSpecTreeEnv(
      methodologyTreeConfig({ [METHODOLOGY_CONFIG_FIELDS.VERSION]: shipped.text }),
      async (env) => {
        await env.materialize();
        const target = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);
        for (const [markers, agent] of rows) {
          const execution = await runSpecCliWithIsolationInEnv(
            env.productDir,
            markers,
            SPEC_DOMAIN_CLI.COMMAND,
            SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
            SPEC_DOMAIN_CLI.CONTEXT_SHOW_COMMAND,
            target,
            SPEC_DOMAIN_CLI.JSON_OPTION,
            SPEC_DOMAIN_CLI.UNDERSTAND_OPTION,
          );

          expect(execution.result.exitCode, execution.result.stderr).toBe(0);
          const manifest = parseContextManifest(execution.result.stdout);
          expect(manifest.read.at(-1)?.content, JSON.stringify(markers)).toBe(
            await shippedFoundationCoreText(shipped.line, agent),
          );
        }
      },
    );
  });
});
