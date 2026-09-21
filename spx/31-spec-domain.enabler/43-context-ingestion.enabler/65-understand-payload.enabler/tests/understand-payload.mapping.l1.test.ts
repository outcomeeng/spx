import { describe, expect, it } from "vitest";

import { inferInvokingCodingAgent } from "@/interfaces/cli/coding-agent";
import { METHODOLOGY_CODING_AGENT, METHODOLOGY_CODING_AGENTS } from "@/lib/methodology";
import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  SPEC_CONTEXT_CASE_TITLE,
  specContextCodingAgentMarkerCases,
} from "@testing/generators/spec-tree/context-target";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextShowEntries,
  contextShowFailure,
  methodologyTreeConfig,
  writeMethodologyTree,
} from "@testing/harnesses/spec/context";

describe("spec context coding-agent scope", () => {
  it.each(specContextCodingAgentMarkerCases(sampleGeneratedValue(arbitraryPathSegment())))(
    SPEC_CONTEXT_CASE_TITLE,
    ({ markers, expected }) => {
      expect(inferInvokingCodingAgent(markers)).toBe(expected);
    },
  );

  it("maps a named agent to its tree, an unnamed agent on a single-agent line to that tree, and an unnamed agent on a multi-agent line to a failure naming the shipped agents", async () => {
    await withSpecTreeEnv(methodologyTreeConfig(), async (env) => {
      await env.materialize();
      const fixture = await writeMethodologyTree(env);
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const options = {
        targets: [target.id],
        cwd: env.productDir,
        methodology: true,
        methodologyTreeRoot: fixture.treeRoot,
      };
      const missing = await contextShowFailure({ ...options, codingAgent: METHODOLOGY_CODING_AGENT.CODEX });
      expect(missing).toContain(METHODOLOGY_CODING_AGENT.CODEX);
      expect(missing).toContain(fixture.codingAgent);

      const named = await contextShowEntries({ ...options, codingAgent: fixture.codingAgent });
      expect(named[0]).toMatchObject({ path: fixture.documentPath, content: fixture.coreText });

      const sole = await contextShowEntries(options);
      expect(sole[0]).toMatchObject({ path: fixture.documentPath, content: fixture.coreText });
    });

    await withSpecTreeEnv(methodologyTreeConfig(), async (env) => {
      await env.materialize();
      const fixture = await writeMethodologyTree(env, { codingAgents: [...METHODOLOGY_CODING_AGENTS] });
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const unresolved = await contextShowFailure({
        targets: [target.id],
        cwd: env.productDir,
        methodology: true,
        methodologyTreeRoot: fixture.treeRoot,
      });
      expect(unresolved).toBeDefined();
      for (const agent of METHODOLOGY_CODING_AGENTS) {
        expect(unresolved).toContain(agent);
      }
    });
  });
});
