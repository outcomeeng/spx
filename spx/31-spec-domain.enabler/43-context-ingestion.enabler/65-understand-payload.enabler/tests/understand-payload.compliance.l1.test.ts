import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_VERSION_FORM } from "@/config/methodology";
import {
  formatRangeOperandFormError,
  FOUNDATION_MANIFEST_RELATIVE_PATH,
  SOURCE_RECORD_RELATIVE_PATH,
} from "@/lib/methodology";
import { compareSpecContextOrdinal, SPEC_CONTEXT_ENTRY_TYPE } from "@/lib/spec-tree";
import * as fc from "fast-check";

import {
  generatedLineFormMigratingMethodologySection,
  generatedMethodologyIdentity,
  generatedMigratingMethodology,
} from "@testing/generators/config/descriptors";
import {
  arbitraryMarkdownBody,
  arbitraryMethodologyVersion,
  generatedSourceRecordProviding,
  supportsRangeContaining,
  supportsRangeExcluding,
} from "@testing/generators/methodology/tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextShowEntries,
  contextShowFailure,
  documentAt,
  methodologyTreeConfig,
  withRichContextEnv,
  writeMethodologyTree,
} from "@testing/harnesses/spec/context";

describe("spec context understand payload provider match", () => {
  it("fails naming both declarations when the recorded provides selects another line, fails naming the migration source when no range holds it or the record declares none, and serves the tree when both agree, the provides in either accepted form", async () => {
    const { section: migrating, target: declared } = generatedMigratingMethodology();
    const version = declared.text;
    const migratingFrom = migrating[METHODOLOGY_CONFIG_FIELDS.MIGRATING_FROM] as string;
    // The generator constructs each version's line beside its text, so the
    // other-line draw and the same-line other-form provides below are chosen
    // by an oracle the production line parse never touches.
    const other = sampleGeneratedValue(
      arbitraryMethodologyVersion().filter((candidate) => candidate.line !== declared.line),
    );
    await withSpecTreeEnv(methodologyTreeConfig(migrating), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];

      const providesOther = await writeMethodologyTree(env, {
        version: declared,
        sourceRecord: generatedSourceRecordProviding(other.text),
      });
      const mismatch = await contextShowFailure({
        targets: [target.id],
        cwd: env.productDir,
        methodology: true,
        methodologyTreeRoot: providesOther.treeRoot,
      });
      expect(mismatch).toContain(version);
      expect(mismatch).toContain(other.text);

      const excluding = supportsRangeExcluding(migratingFrom);
      const outsideSupports = await writeMethodologyTree(env, {
        version: declared,
        sourceRecord: generatedSourceRecordProviding(version, excluding),
      });
      const outside = await contextShowFailure({
        targets: [target.id],
        cwd: env.productDir,
        methodology: true,
        methodologyTreeRoot: outsideSupports.treeRoot,
      });
      expect(outside).toContain(migratingFrom);
      expect(outside).toContain(excluding);

      const noSupports = await writeMethodologyTree(env, {
        version: declared,
        sourceRecord: generatedSourceRecordProviding(version),
      });
      const unverifiable = await contextShowFailure({
        targets: [target.id],
        cwd: env.productDir,
        methodology: true,
        methodologyTreeRoot: noSupports.treeRoot,
      });
      expect(unverifiable).toContain(migratingFrom);

      const agreeing = await writeMethodologyTree(env, {
        version: declared,
        sourceRecord: generatedSourceRecordProviding(version, supportsRangeContaining(migratingFrom)),
      });
      const entries = await contextShowEntries({
        targets: [target.id],
        cwd: env.productDir,
        methodology: true,
        methodologyTreeRoot: agreeing.treeRoot,
      });
      expect(entries[0]).toMatchObject({ path: agreeing.documentPath, content: agreeing.coreText });

      const sameLineOtherForm = await writeMethodologyTree(env, {
        version: declared,
        sourceRecord: generatedSourceRecordProviding(declared.line, supportsRangeContaining(migratingFrom)),
      });
      const servedAcrossForms = await contextShowEntries({
        targets: [target.id],
        cwd: env.productDir,
        methodology: true,
        methodologyTreeRoot: sameLineOtherForm.treeRoot,
      });
      expect(servedAcrossForms[0]).toMatchObject({
        path: sameLineOtherForm.documentPath,
        content: sameLineOtherForm.coreText,
      });
    });
  });

  it("fails naming a MAJOR.MINOR migration source checked against a patched supports bound instead of serving the tree on a verdict that read no patch component", async () => {
    const { section, forms, target: declared } = generatedLineFormMigratingMethodologySection();
    const version = declared.text;
    const migratingFrom = forms.byForm[METHODOLOGY_VERSION_FORM.LINE];
    await withSpecTreeEnv(methodologyTreeConfig(section), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const patchedBound = await writeMethodologyTree(env, {
        version: declared,
        sourceRecord: generatedSourceRecordProviding(
          version,
          supportsRangeContaining(forms.byForm[METHODOLOGY_VERSION_FORM.PATCHED]),
        ),
      });
      const failure = await contextShowFailure({
        targets: [target.id],
        cwd: env.productDir,
        methodology: true,
        methodologyTreeRoot: patchedBound.treeRoot,
      });
      // The range check's own diagnostic, never the config descriptor's
      // rejection, proves the declaration resolved and the supports check ran.
      expect(failure).toContain(formatRangeOperandFormError(migratingFrom));
    });
  });
});

describe("spec context understand payload sourcing", () => {
  it("serves the manifest-named core and keeps the manifest, source record, and catalog resources out of show", async () => {
    const identity = generatedMethodologyIdentity();
    await withSpecTreeEnv(methodologyTreeConfig(identity.section), async (env) => {
      await env.materialize();
      // The tree carries the source record, so the absence below is the
      // projection leaving it out rather than the file never existing.
      const fixture = await writeMethodologyTree(env, {
        coreText: sampleGeneratedValue(arbitraryMarkdownBody()),
        version: identity.version,
        sourceRecord: generatedSourceRecordProviding(identity.version.text),
      });
      const snapshot = await env.readFilesystemSnapshot();
      const served = await contextShowEntries({
        targets: [snapshot.allNodes[0].id],
        cwd: env.productDir,
        methodology: true,
        methodologyTreeRoot: fixture.treeRoot,
      });
      expect(served[0]).toEqual({
        type: SPEC_CONTEXT_ENTRY_TYPE.DOCUMENT,
        path: fixture.documentPath,
        metadata: {},
        content: fixture.coreText,
      });
      for (
        const internal of [FOUNDATION_MANIFEST_RELATIVE_PATH, SOURCE_RECORD_RELATIVE_PATH, ...fixture.catalogPaths]
      ) {
        expect(served.some((entry) => entry.path.endsWith(internal)), internal).toBe(false);
      }
    });
  });

  it("persists no context state between show invocations and projects each invocation from the tracked and shipped content present when it runs", async () => {
    const [firstCore, laterCore] = sampleGeneratedValue(
      fc.tuple(arbitraryMarkdownBody(), arbitraryMarkdownBody()).filter(([first, later]) => first !== later),
    );
    await withRichContextEnv(async (env, paths) => {
      const fixture = await writeMethodologyTree(env, { coreText: firstCore });
      const options = {
        targets: [paths.targetId],
        cwd: env.productDir,
        methodology: true,
        methodologyTreeRoot: fixture.treeRoot,
      };
      // The shipped tree stands under the product directory, so one listing
      // covers every location an invocation could leave state in.
      const before = (await readdir(env.productDir, { recursive: true })).sort(compareSpecContextOrdinal);
      const first = await contextShowEntries(options);
      expect((await readdir(env.productDir, { recursive: true })).sort(compareSpecContextOrdinal)).toEqual(before);
      expect(first[0]).toMatchObject({ path: fixture.documentPath, content: firstCore });
      // A later invocation over changed shipped and tracked content projects
      // the content as it stands, so nothing the first run produced survives
      // into the second.
      const marker = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
      await writeFile(join(fixture.treeDir, fixture.corePath), laterCore);
      await env.writeRaw(paths.targetSpecPath, `${paths.sourceText[paths.targetSpecPath]}\n${marker}\n`);
      const later = await contextShowEntries(options);
      expect(later[0]).toMatchObject({ path: fixture.documentPath, content: laterCore });
      expect(documentAt(first, paths.targetSpecPath)?.content).not.toContain(marker);
      expect(documentAt(later, paths.targetSpecPath)?.content).toContain(marker);
    });
  });
});
