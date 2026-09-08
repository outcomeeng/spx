import { writeFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { HOOK_SESSION_START_ENV, type HookSessionStartEnv } from "@/domains/hooks/session-start";
import { inferInvokingCodingAgent } from "@/interfaces/cli/coding-agent";
import {
  FOUNDATION_MANIFEST_FIELDS,
  FOUNDATION_MANIFEST_SCHEMA_VERSION,
  METHODOLOGY_CODING_AGENT,
  METHODOLOGY_CODING_AGENTS,
  type MethodologyCodingAgent,
} from "@/lib/methodology";
import { SPEC_CONTEXT_CONTENT_FIELDS, SPEC_CONTEXT_LISTED_ROLE } from "@/lib/spec-tree";
import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextCommand,
  contextCommandFailure,
  listedPathsForRole,
  methodologyTreeConfig,
  parseContextManifest,
  rootedSpecPath,
  writeMethodologyTree,
} from "@testing/harnesses/spec/context";

describe("spec context coding-agent scope", () => {
  it("maps each invocation marker set to the coding agent in scope: Codex before Claude Code, Claude Code from either of its markers, none otherwise", () => {
    const marker = sampleGeneratedValue(arbitraryPathSegment());
    // The precedence is the one the harness-environment descriptor declares:
    // the Codex thread marker, then either Claude Code marker.
    const rows: readonly (readonly [HookSessionStartEnv, MethodologyCodingAgent | undefined])[] = [
      [{ [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: marker }, METHODOLOGY_CODING_AGENT.CODEX],
      [{ [HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID]: marker }, METHODOLOGY_CODING_AGENT.CLAUDE],
      [{ [HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE]: marker }, METHODOLOGY_CODING_AGENT.CLAUDE],
      [
        { [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: marker, [HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID]: marker },
        METHODOLOGY_CODING_AGENT.CODEX,
      ],
      [{}, undefined],
    ];
    for (const [env, expected] of rows) {
      expect(inferInvokingCodingAgent(env), JSON.stringify(env)).toBe(expected);
    }
  });

  it("maps a named agent to its tree, an unnamed agent on a single-agent line to that tree, and an unnamed agent on a multi-agent line to a failure naming the shipped agents", async () => {
    await withSpecTreeEnv(methodologyTreeConfig(), async (env) => {
      await env.materialize();
      const fixture = await writeMethodologyTree(env);
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];

      const missing = await contextCommandFailure({
        targets: [target.id],
        cwd: env.productDir,
        understand: true,
        codingAgent: METHODOLOGY_CODING_AGENT.CODEX,
        methodologyTreeRoot: fixture.treeRoot,
      });
      expect(missing).toContain(METHODOLOGY_CODING_AGENT.CODEX);
      expect(missing).toContain(fixture.codingAgent);

      const named = parseContextManifest(
        await contextCommand({
          targets: [target.id],
          cwd: env.productDir,
          understand: true,
          codingAgent: fixture.codingAgent,
          methodologyTreeRoot: fixture.treeRoot,
        }),
      );
      expect(named.read.at(-1)?.content).toBe(fixture.coreText);

      const sole = parseContextManifest(
        await contextCommand({
          targets: [target.id],
          cwd: env.productDir,
          understand: true,
          methodologyTreeRoot: fixture.treeRoot,
        }),
      );
      expect(sole.read.at(-1)?.content).toBe(fixture.coreText);
    });

    await withSpecTreeEnv(methodologyTreeConfig(), async (env) => {
      await env.materialize();
      const fixture = await writeMethodologyTree(env, { codingAgents: [...METHODOLOGY_CODING_AGENTS] });
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];

      const unresolved = await contextCommandFailure({
        targets: [target.id],
        cwd: env.productDir,
        understand: true,
        methodologyTreeRoot: fixture.treeRoot,
      });
      expect(unresolved).toBeDefined();
      for (const agent of METHODOLOGY_CODING_AGENTS) {
        expect(unresolved).toContain(agent);
      }
    });
  });
});

describe("spec context methodology catalog", () => {
  it("maps each extended reference, template, and example to a listed methodology-catalog entry carrying no body", async () => {
    await withSpecTreeEnv(methodologyTreeConfig(), async (env) => {
      await env.materialize();
      const fixture = await writeMethodologyTree(env);
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

      expect(listedPathsForRole(manifest, SPEC_CONTEXT_LISTED_ROLE.METHODOLOGY_CATALOG)).toEqual(
        fixture.catalogPaths,
      );
      for (const catalogPath of fixture.catalogPaths) {
        const entry = manifest.listed.find((candidate) => candidate.path === catalogPath);
        expect(entry?.roles).toEqual([
          { target: rootedSpecPath(target.id), role: SPEC_CONTEXT_LISTED_ROLE.METHODOLOGY_CATALOG },
        ]);
        for (const field of Object.values(SPEC_CONTEXT_CONTENT_FIELDS)) {
          expect(entry).not.toHaveProperty(field);
        }
      }
      expect(manifest.coverage.at(0)?.listed).toEqual(
        expect.arrayContaining([...fixture.catalogPaths]),
      );
    });
  });

  it("maps a manifest-declared identity with no file on disk to a listed entry unchanged", async () => {
    await withSpecTreeEnv(methodologyTreeConfig(), async (env) => {
      await env.materialize();
      const fixture = await writeMethodologyTree(env);
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      // Catalog entries are projections of parsed manifest data: an absent
      // resource stays visible instead of being silently dropped, so plugin
      // breakage the manifest declares is not hidden by the projection.
      const absentCatalogPath = `${fixture.corePath}-absent.md`;
      const manifest = {
        [FOUNDATION_MANIFEST_FIELDS.SCHEMA_VERSION]: FOUNDATION_MANIFEST_SCHEMA_VERSION,
        [FOUNDATION_MANIFEST_FIELDS.CORE]: fixture.corePath,
        [FOUNDATION_MANIFEST_FIELDS.REFERENCES]: [absentCatalogPath],
        [FOUNDATION_MANIFEST_FIELDS.TEMPLATES]: [],
        [FOUNDATION_MANIFEST_FIELDS.EXAMPLES]: [],
      };
      await writeFile(fixture.manifestPath, JSON.stringify(manifest));

      const projected = parseContextManifest(
        await contextCommand({
          targets: [target.id],
          cwd: env.productDir,
          understand: true,
          methodologyTreeRoot: fixture.treeRoot,
        }),
      );
      expect(listedPathsForRole(projected, SPEC_CONTEXT_LISTED_ROLE.METHODOLOGY_CATALOG)).toEqual([
        absentCatalogPath,
      ]);
    });
  });
});
