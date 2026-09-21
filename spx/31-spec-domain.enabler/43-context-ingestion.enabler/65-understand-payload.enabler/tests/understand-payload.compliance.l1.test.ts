import { describe, expect, it } from "vitest";

import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_VERSION_FORM } from "@/config/methodology";
import { SPEC_DOMAIN_CLI } from "@/interfaces/cli/spec";
import {
  formatRangeOperandFormError,
  FOUNDATION_MANIFEST_RELATIVE_PATH,
  SOURCE_RECORD_RELATIVE_PATH,
} from "@/lib/methodology";
import { SPEC_CONTEXT_ENTRY_TYPE } from "@/lib/spec-tree";
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
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextShowEntries,
  contextShowFailure,
  methodologyTreeConfig,
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
  it("always sources the foundation body from the shipped tree's manifest-named core and never persists a loaded-methodology state", async () => {
    // Two runs over two different shipped core bodies: the emitted body
    // tracks the shipped resource bytes exactly, so no embedded snapshot can
    // be the source; a --loaded-methodology run in between leaves nothing
    // behind that changes the next request.
    const identity = generatedMethodologyIdentity();
    const bodies = sampleGeneratedValue(
      fc.tuple(arbitraryMarkdownBody(), arbitraryMarkdownBody()).filter(([first, second]) => first !== second),
    );
    for (const coreText of bodies) {
      await withSpecTreeEnv(methodologyTreeConfig(identity.section), async (env) => {
        await env.materialize();
        const fixture = await writeMethodologyTree(env, { coreText, version: identity.version });
        const snapshot = await env.readFilesystemSnapshot();
        const target = snapshot.allNodes[0];

        const options = {
          targets: [target.id],
          cwd: env.productDir,
          methodologyTreeRoot: fixture.treeRoot,
        };
        const served = await contextShowEntries({ ...options, methodology: true });
        expect(served[0]).toEqual({
          type: SPEC_CONTEXT_ENTRY_TYPE.DOCUMENT,
          path: fixture.documentPath,
          metadata: {},
          content: coreText,
        });
        // The manifest, source record, and catalog resources stay internal.
        for (
          const internal of [FOUNDATION_MANIFEST_RELATIVE_PATH, SOURCE_RECORD_RELATIVE_PATH, ...fixture.catalogPaths]
        ) {
          expect(served.some((entry) => entry.path.endsWith(internal)), internal).toBe(false);
        }
        const declaredLoaded = await contextShowEntries({ ...options, loadedMethodology: true });
        expect(declaredLoaded[0]?.path).toBe(snapshot.product?.ref?.path);
        expect(await contextShowEntries({ ...options, methodology: true })).toEqual(served);
      });
    }
  });

  it("never accepts --methodology together with --loaded-methodology", async () => {
    await withSpecTreeEnv(methodologyTreeConfig(), async (env) => {
      await env.materialize();
      const fixture = await writeMethodologyTree(env);
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const failure = await contextShowFailure({
        targets: [target.id],
        cwd: env.productDir,
        methodology: true,
        loadedMethodology: true,
        methodologyTreeRoot: fixture.treeRoot,
      });
      expect(failure).toContain(SPEC_DOMAIN_CLI.METHODOLOGY_OPTION);
      expect(failure).toContain(SPEC_DOMAIN_CLI.LOADED_METHODOLOGY_OPTION);
    });
  });
});
