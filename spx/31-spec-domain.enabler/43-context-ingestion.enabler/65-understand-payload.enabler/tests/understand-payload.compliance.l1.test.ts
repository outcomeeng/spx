import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, posix } from "node:path";

import { describe, expect, it } from "vitest";

import { METHODOLOGY_CONFIG_FIELDS } from "@/config/methodology";
import {
  formatMethodologyVersionName,
  FOUNDATION_MANIFEST_FIELDS,
  FOUNDATION_MANIFEST_RELATIVE_PATH,
  FOUNDATION_SKILL_DIR_PLACEHOLDERS,
  METHODOLOGY_CODING_AGENTS,
  SOURCE_RECORD_RELATIVE_PATH,
} from "@/lib/methodology";
import { compareSpecContextOrdinal, SPEC_CONTEXT_ENTRY_TYPE } from "@/lib/spec-tree";
import * as fc from "fast-check";

import { generatedMethodologyIdentity, generatedMigratingMethodology } from "@testing/generators/config/descriptors";
import {
  arbitraryMarkdownBody,
  arbitraryMethodologyVersion,
  generatedSourceRecordProviding,
  methodologyFoundationDocumentPath,
  supportsRangeContaining,
  supportsRangeExcluding,
} from "@testing/generators/methodology/tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { PRODUCT_ROOT } from "@testing/harnesses/constants";
import {
  shippedFoundationCoreBody,
  shippedMethodologyVersion,
  shippedTreeRelativeDir,
} from "@testing/harnesses/methodology/shipped-tree";
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
    const { section: migrating, target: declared, source: migrationSource } = generatedMigratingMethodology();
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
      expect(mismatch).toContain(formatMethodologyVersionName(declared.line));
      expect(mismatch).toContain(formatMethodologyVersionName(other.line));

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
      expect(outside).toContain(formatMethodologyVersionName(migrationSource.line));
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
      expect(unverifiable).toContain(formatMethodologyVersionName(migrationSource.line));

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
      expect(entries[0]).toMatchObject({
        path: methodologyFoundationDocumentPath(agreeing),
        content: agreeing.coreText,
      });

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
        path: methodologyFoundationDocumentPath(sameLineOtherForm),
        content: sameLineOtherForm.coreText,
      });
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
        path: methodologyFoundationDocumentPath(fixture),
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

  it("resolves every core-relative catalog resource against the framed bundle path to the shipped resource", async () => {
    const identity = generatedMethodologyIdentity();
    await withSpecTreeEnv(methodologyTreeConfig(identity.section), async (env) => {
      await env.materialize();
      const fixture = await writeMethodologyTree(env, { version: identity.version });
      const snapshot = await env.readFilesystemSnapshot();
      const served = await contextShowEntries({
        targets: [snapshot.allNodes[0].id],
        cwd: env.productDir,
        methodology: true,
        methodologyTreeRoot: fixture.treeRoot,
      });
      const framedPath = served[0]?.path ?? "";
      // The frame names the core under its bundle; stripping the core value
      // leaves the bundle path a workflow resolves a catalog resource against.
      expect(framedPath.endsWith(fixture.corePath)).toBe(true);
      const bundlePath = framedPath.slice(0, framedPath.length - fixture.corePath.length);
      for (const catalogPath of fixture.catalogPaths) {
        expect(await readFile(join(fixture.packageRoot, bundlePath, catalogPath)), catalogPath).toEqual(
          Buffer.from(fixture.catalogTexts[catalogPath]),
        );
      }
    });
  });

  it("delivers a shipped core whose every named reference addresses a shipped resource and which carries no skill-directory placeholder", async () => {
    const { line } = await shippedMethodologyVersion();
    for (const codingAgent of METHODOLOGY_CODING_AGENTS) {
      const body = await shippedFoundationCoreBody(line, codingAgent);
      for (const placeholder of FOUNDATION_SKILL_DIR_PLACEHOLDERS) {
        expect(body.includes(placeholder), `${codingAgent} ${placeholder}`).toBe(false);
      }
      // Every reference resolves against the package root the framed core path
      // is relative to: the bundle address names the shipped tree, and the
      // reference path follows the skill directory the placeholders stood for.
      const addressPrefix = shippedTreeRelativeDir(line, codingAgent).replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
      const { REFERENCES, TEMPLATES } = FOUNDATION_MANIFEST_FIELDS;
      const referenceAddress = new RegExp(
        String.raw`${addressPrefix}/[A-Za-z0-9._/-]+/${REFERENCES}/[A-Za-z0-9._-]+\.md`,
        "g",
      );
      const templateAddress = new RegExp(String.raw`${addressPrefix}/[A-Za-z0-9._/-]+/${TEMPLATES}`, "g");
      const templateRoots = [...new Set(body.match(templateAddress) ?? [])];
      expect(templateRoots.length, codingAgent).toBeGreaterThan(0);
      for (const templateRoot of templateRoots) {
        expect((await readdir(join(PRODUCT_ROOT, ...templateRoot.split(posix.sep)))).length, templateRoot)
          .toBeGreaterThan(0);
      }
      const named = [...new Set(body.match(referenceAddress) ?? [])];
      expect(named.length, codingAgent).toBeGreaterThan(0);
      for (const reference of named) {
        expect((await readFile(join(PRODUCT_ROOT, ...reference.split(posix.sep)))).length, reference).toBeGreaterThan(
          0,
        );
      }
    }
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
      expect(first[0]).toMatchObject({ path: methodologyFoundationDocumentPath(fixture), content: firstCore });
      // A later invocation over changed shipped and tracked content projects
      // the content as it stands, so nothing the first run produced survives
      // into the second.
      const marker = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
      await writeFile(join(fixture.treeDir, fixture.corePath), laterCore);
      await env.writeRaw(paths.targetSpecPath, `${paths.sourceText[paths.targetSpecPath]}\n${marker}\n`);
      const later = await contextShowEntries(options);
      expect(later[0]).toMatchObject({ path: methodologyFoundationDocumentPath(fixture), content: laterCore });
      expect(documentAt(first, paths.targetSpecPath)?.content).not.toContain(marker);
      expect(documentAt(later, paths.targetSpecPath)?.content).toContain(marker);
    });
  });
});
