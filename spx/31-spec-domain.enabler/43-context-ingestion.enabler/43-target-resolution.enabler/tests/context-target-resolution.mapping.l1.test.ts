import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { formatSpecContextTargetFailure } from "@/interfaces/cli/spec";
import { SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX } from "@/interfaces/cli/spec-context-contract";
import { sanitizeCliArgument } from "@/lib/sanitize-cli-argument";
import {
  KIND_REGISTRY,
  resolveSpecContextTarget,
  SPEC_CONTEXT_TARGET_FAILURE_KIND,
  SPEC_TREE_CONFIG,
  type SpecTreeNode,
  type SpecTreeSnapshot,
} from "@/lib/spec-tree";
import {
  SPEC_CONTEXT_CASE_TITLE,
  SPEC_CONTEXT_EMPTY_SEGMENT_TOPOLOGY,
  SPEC_CONTEXT_FILESYSTEM_ARTIFACT_TYPE,
  SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND,
  specContextAbbreviatedTarget,
  specContextAmbiguousTargetFixture,
  type SpecContextArtifactMappingCase,
  specContextArtifactTargetFixture,
  type SpecContextEmptySegmentMappingCase,
  specContextEmptySegmentSourceFixture,
  specContextEmptySegmentTargetFixture,
  specContextTargetDiagnosticSafetyCases,
  type SpecContextTargetMappingCase,
  specContextTargetMappingCases,
  specContextUnknownTarget,
  specContextUnrecognizedNodeDirectoryTarget,
} from "@testing/generators/spec-tree/context-target";
import { specTreeFixtureNodeDirectoryName } from "@testing/generators/spec-tree/spec-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextCommand,
  divergentOrderSlugPair,
  parseContextManifest,
  rejectedContextMessage,
  rootedSpecPath,
  specTreeKindsConfig,
} from "@testing/harnesses/spec/context";

async function assertResolvesTarget(
  selectInput: (snapshot: SpecTreeSnapshot, target: SpecTreeNode) => string,
): Promise<void> {
  await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
    await env.materialize();
    const snapshot = await env.readFilesystemSnapshot();
    const target = snapshot.allNodes.find((node) => node.parentId !== undefined) ?? snapshot.allNodes[0];
    const manifest = parseContextManifest(
      await contextCommand({ targets: [selectInput(snapshot, target)], cwd: env.productDir }),
    );
    expect(manifest.targets).toEqual([rootedSpecPath(target.id)]);
  });
}

async function assertRejectsUnknownTarget(): Promise<void> {
  await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
    await env.materialize();
    const target = specContextUnknownTarget(env.fixture);
    const message = await rejectedContextMessage(target, env.productDir);
    expect(message).toContain(target);
    expect(message).toContain(
      SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[SPEC_CONTEXT_TARGET_FAILURE_KIND.UNKNOWN_SEGMENT],
    );
  });
}

async function assertRejectsAmbiguousTarget(): Promise<void> {
  await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
    await env.materialize();
    const ambiguity = specContextAmbiguousTargetFixture(env.fixture);
    await env.writeRaw(ambiguity.specPath, "# Ambiguous sibling\n");
    const message = await rejectedContextMessage(ambiguity.prefix, env.productDir);
    expect(message).toContain(ambiguity.prefix);
    expect(message).toContain(
      SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[SPEC_CONTEXT_TARGET_FAILURE_KIND.AMBIGUOUS_SEGMENT],
    );
    expect(message).toContain(ambiguity.candidate);
    expect(message).toContain(specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root));
  });
}

async function assertRejectsArtifactTarget(mappingCase: SpecContextArtifactMappingCase): Promise<void> {
  await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
    const fixture = specContextArtifactTargetFixture(env.fixture, mappingCase);
    let message: string;
    if (fixture.filesystemArtifact === undefined) {
      const snapshot = await env.readMemorySnapshot(fixture.sourceFixture);
      expect(resolveSpecContextTarget(snapshot, fixture.target)).toMatchObject({
        failure: fixture.failure,
        ok: false,
      });
      message = formatSpecContextTargetFailure(fixture.failure);
    } else {
      await env.materialize(fixture.sourceFixture);
      if (fixture.filesystemArtifact.type === SPEC_CONTEXT_FILESYSTEM_ARTIFACT_TYPE.DIRECTORY) {
        await mkdir(join(env.productDir, fixture.target), { recursive: true });
      } else {
        await env.writeRaw(fixture.target, fixture.filesystemArtifact.content);
      }
      message = await rejectedContextMessage(fixture.target, env.productDir);
    }
    expect(message).toContain(fixture.target);
    expect(message).toContain(SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[fixture.failure.kind]);
    if (fixture.failure.kind === SPEC_CONTEXT_TARGET_FAILURE_KIND.ARTIFACT_PATH) {
      expect(message).toContain(fixture.failure.ownerId);
    }
  });
}

async function assertRejectsUnrecognizedNodeDirectoryTarget(
  mappingCase: Extract<
    SpecContextTargetMappingCase,
    {
      readonly kind:
        | typeof SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.INVALID_DIRECTORY
        | typeof SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.SUPERSEDED_DIRECTORY;
    }
  >,
): Promise<void> {
  await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
    const target = specContextUnrecognizedNodeDirectoryTarget(env.fixture, mappingCase.kind);
    await env.materialize();
    await mkdir(join(env.productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY, target), { recursive: true });
    const message = await rejectedContextMessage(target, env.productDir);
    expect(message).toContain(target);
    expect(message).toContain(
      SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[SPEC_CONTEXT_TARGET_FAILURE_KIND.UNKNOWN_SEGMENT],
    );
  });
}

async function assertRejectsEmptySegmentTarget(
  mappingCase: SpecContextEmptySegmentMappingCase,
): Promise<void> {
  await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
    const sourceFixture = specContextEmptySegmentSourceFixture(env.fixture, mappingCase.topology);
    let snapshot: SpecTreeSnapshot;
    if (mappingCase.topology === SPEC_CONTEXT_EMPTY_SEGMENT_TOPOLOGY.SINGLE_ROOT) {
      snapshot = await env.readMemorySnapshot(sourceFixture);
    } else {
      await env.materialize(sourceFixture);
      snapshot = await env.readFilesystemSnapshot();
    }
    const fixture = specContextEmptySegmentTargetFixture(snapshot, mappingCase.position);
    expect(resolveSpecContextTarget(snapshot, fixture.target)).toMatchObject({
      failure: {
        input: fixture.target,
        kind: SPEC_CONTEXT_TARGET_FAILURE_KIND.UNKNOWN_SEGMENT,
        segment: fixture.segment,
      },
      ok: false,
    });
  });
}

async function assertTargetMappingCase(mappingCase: SpecContextTargetMappingCase): Promise<void> {
  switch (mappingCase.kind) {
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.CANONICAL:
      await assertResolvesTarget((_snapshot, target) => target.id);
      return;
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.ROOTED:
      await assertResolvesTarget((_snapshot, target) => rootedSpecPath(target.id));
      return;
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.TRAILING_SEPARATOR:
      await assertResolvesTarget((_snapshot, target) => `${target.id}/`);
      return;
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.ABBREVIATED:
      await assertResolvesTarget((snapshot, target) => specContextAbbreviatedTarget(snapshot, target));
      return;
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.EMPTY_SEGMENT:
      await assertRejectsEmptySegmentTarget(mappingCase);
      return;
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.UNKNOWN:
      await assertRejectsUnknownTarget();
      return;
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.AMBIGUOUS:
      await assertRejectsAmbiguousTarget();
      return;
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.ARTIFACT:
      await assertRejectsArtifactTarget(mappingCase);
      return;
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.INVALID_DIRECTORY:
    case SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.SUPERSEDED_DIRECTORY:
      await assertRejectsUnrecognizedNodeDirectoryTarget(mappingCase);
  }
}

describe("spec context target resolution mapping", () => {
  it.each(specContextTargetMappingCases())(SPEC_CONTEXT_CASE_TITLE, assertTargetMappingCase);

  it.each(specContextTargetDiagnosticSafetyCases())(SPEC_CONTEXT_CASE_TITLE, (safetyCase) => {
    const message = formatSpecContextTargetFailure(safetyCase.failure);
    expect(message).toContain(sanitizeCliArgument(safetyCase.unsafeValue));
    expect(message).not.toContain(safetyCase.unsafeValue);
  });

  it("orders ambiguous-segment candidates by code units where locale collation disagrees", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const nodeSuffix = KIND_REGISTRY[env.fixture.root.kind].suffix;
      const pair = divergentOrderSlugPair();
      const ambiguousOrder = Math.max(env.fixture.root.order, env.fixture.peer.order) + 1;
      const codeUnitFirstDirectory = `${ambiguousOrder}-${pair.codeUnitFirst}${nodeSuffix}`;
      const localeFirstDirectory = `${ambiguousOrder}-${pair.localeFirst}${nodeSuffix}`;
      await env.writeRaw(rootedSpecPath(`${codeUnitFirstDirectory}/${pair.codeUnitFirst}.md`), "# Ambiguous pair\n");
      await env.writeRaw(rootedSpecPath(`${localeFirstDirectory}/${pair.localeFirst}.md`), "# Ambiguous pair\n");

      const snapshot = await env.readFilesystemSnapshot();
      const resolution = resolveSpecContextTarget(snapshot, `${ambiguousOrder}`);
      if (resolution.ok || resolution.failure.kind !== SPEC_CONTEXT_TARGET_FAILURE_KIND.AMBIGUOUS_SEGMENT) {
        throw new Error("Expected an ambiguous-segment resolution failure for the shared order prefix");
      }
      expect(
        resolution.failure.candidates.filter(
          (candidate) => candidate === codeUnitFirstDirectory || candidate === localeFirstDirectory,
        ),
      ).toStrictEqual([codeUnitFirstDirectory, localeFirstDirectory]);
    });
  });
});
