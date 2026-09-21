import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { formatSpecContextTargetFailure } from "@/interfaces/cli/spec";
import { SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX } from "@/interfaces/cli/spec-context-contract";
import { sanitizeCliArgument } from "@/lib/sanitize-cli-argument";
import { SPEC_CONTEXT_TARGET_FAILURE_KIND } from "@/lib/spec-tree";
import {
  SPEC_CONTEXT_CASE_TITLE,
  specContextAcceptedTargetCases,
  specContextAcceptedTargetOperand,
  specContextRejectedTargetCases,
  specContextRejectedTargetOperand,
  specContextTargetDiagnosticSafetyCases,
} from "@testing/generators/spec-tree/context-target";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextListFailure,
  contextListManifest,
  specTreeKindsConfig,
  trackSpecTreeInGit,
} from "@testing/harnesses/spec/context";
import { createTempDir, removeTempDir } from "@testing/harnesses/with-temp-dir";

describe("spec context target resolution mapping", () => {
  it.each(specContextAcceptedTargetCases())(SPEC_CONTEXT_CASE_TITLE, async (mappingCase) => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const resolved = specContextAcceptedTargetOperand(env.fixture, env.productDir, mappingCase);
      for (const artifact of resolved.artifacts) await env.writeRaw(artifact.path, artifact.content);
      await trackSpecTreeInGit(env);
      const cwd = join(env.productDir, resolved.invocationDir);
      await mkdir(cwd, { recursive: true });
      const manifest = await contextListManifest({ targets: [resolved.operand], cwd });
      expect(manifest.targets).toEqual([resolved.expectedTarget]);
    });
  });

  it.each(specContextRejectedTargetCases())(SPEC_CONTEXT_CASE_TITLE, async (mappingCase) => {
    const outsideDir = await createTempDir("spx-context-outside-");
    try {
      await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
        await env.materialize();
        const rejected = specContextRejectedTargetOperand(env.fixture, env.productDir, outsideDir, mappingCase);
        for (const artifact of rejected.artifacts) await env.writeRaw(artifact.path, artifact.content);
        for (const directory of rejected.directories) {
          await mkdir(join(env.productDir, directory), { recursive: true });
        }
        const cwd = join(env.productDir, rejected.invocationDir);
        const failure = await contextListFailure({ targets: [rejected.operand], cwd });
        expect(failure).toContain(SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[rejected.expectedKind]);
        expect(failure).toContain(sanitizeCliArgument(rejected.operand));
        for (const candidate of rejected.expectedCandidates) {
          expect(failure).toContain(candidate);
        }
      });
    } finally {
      await removeTempDir(outsideDir);
    }
  });

  it.each(specContextTargetDiagnosticSafetyCases())(SPEC_CONTEXT_CASE_TITLE, (safetyCase) => {
    const message = String(formatSpecContextTargetFailure(safetyCase.failure));
    expect(message).toContain(SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[safetyCase.failure.kind]);
    expect(message).toContain(sanitizeCliArgument(safetyCase.unsafeValue));
    expect(message).not.toContain(safetyCase.unsafeValue);
    if (safetyCase.failure.kind === SPEC_CONTEXT_TARGET_FAILURE_KIND.AMBIGUOUS) {
      expect(message.indexOf(sanitizeCliArgument(safetyCase.unsafeValue))).toBeLessThan(
        message.lastIndexOf(sanitizeCliArgument(safetyCase.unsafeValue)),
      );
    }
  });
});
