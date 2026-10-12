import { describe, expect, it } from "vitest";

import {
  createFilesystemSpecTreeSource,
  readSpecTree,
  SPEC_TREE_CONFIG,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_EVIDENCE_FILE,
  SPEC_TREE_EVIDENCE_STATUS,
} from "@/lib/spec-tree";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import {
  SPEC_TREE_CASE_TITLE,
  SPEC_TREE_SOURCE_MAPPING_CASE_KIND,
  specTreeSourceMappingCases,
} from "@testing/generators/spec-tree/spec-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  ambiguousEvidenceFileName,
  evidenceFileName,
  evidenceFilePath,
  isEvidenceEntry,
  nodeDirectoryName,
} from "@testing/harnesses/spec-tree/spec-tree-source";

describe("SpecTreeSource mappings", () => {
  it.each(specTreeSourceMappingCases())(SPEC_TREE_CASE_TITLE, async (testCase) => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootDirectory = nodeDirectoryName(env.fixture.root);
      switch (testCase.kind) {
        case SPEC_TREE_SOURCE_MAPPING_CASE_KIND.PRODUCT_RELATIVE_REFS: {
          const excludedDirectories = [
            nodeDirectoryName(env.fixture.peer),
            `${rootDirectory}/${nodeDirectoryName(env.fixture.child)}`,
          ];
          const includedText = await env.readFile(
            `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${rootDirectory}/${env.fixture.root.slug}.md`,
          );
          const source = createFilesystemSpecTreeSource({
            productDir: env.productDir,
            includePath: (path) => excludedDirectories.every((directory) => !path.includes(directory)),
          });
          const snapshot = await readSpecTree({ source });
          const ref = snapshot.allNodes[0]?.ref;
          expect(ref).toBeDefined();
          expect(snapshot.allNodes.map((node) => node.id)).toEqual([rootDirectory]);
          expect(ref?.path).toBe(`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${rootDirectory}/${env.fixture.root.slug}.md`);
          expect(source.readText).toBeDefined();
          await expect(source.readText?.(ref!)).resolves.toBe(includedText);
          return;
        }
        case SPEC_TREE_SOURCE_MAPPING_CASE_KIND.RECOGNIZED_ENTRY_ROLE: {
          const snapshot = await readSpecTree({ source: env.filesystemSource() });
          switch (testCase.entryType) {
            case SPEC_TREE_ENTRY_TYPE.PRODUCT:
              expect(snapshot.product?.ref?.path).toContain(SPEC_TREE_CONFIG.PRODUCT.SUFFIX);
              return;
            case SPEC_TREE_ENTRY_TYPE.NODE: {
              const root = snapshot.allNodes.find((node) => node.id === rootDirectory);
              expect(root?.id).toBe(rootDirectory);
              expect(root?.ref?.path).toContain(rootDirectory);
              return;
            }
            case SPEC_TREE_ENTRY_TYPE.DECISION:
              expect(snapshot.decisions[0]).toMatchObject({ parentId: rootDirectory });
              expect(snapshot.decisions[0]?.ref?.path).toContain(rootDirectory);
              return;
            case SPEC_TREE_ENTRY_TYPE.EVIDENCE: {
              const evidenceFiles = Object.values(SPEC_TREE_EVIDENCE_FILE.TAILS).map((tail) => evidenceFileName(tail));
              const evidencePath = evidenceFilePath(rootDirectory, evidenceFiles[0]);
              for (const evidenceFile of evidenceFiles) {
                await env.writeRaw(evidenceFilePath(rootDirectory, evidenceFile), "");
              }
              await env.writeRaw(`${evidencePath}${SPEC_TREE_CONFIG.PRODUCT.SUFFIX}`, "");
              await env.writeRaw(evidenceFilePath(rootDirectory, ambiguousEvidenceFileName()), "");
              const evidence = (await readSpecTree({ source: env.filesystemSource() })).entries.filter(
                isEvidenceEntry,
              );
              const expectedIds = evidenceFiles.map((file) =>
                `${rootDirectory}/${SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME}/${file}`
              );
              const first = evidence.find((entry) => entry.id === expectedIds[0]);
              expect(evidence).toHaveLength(evidenceFiles.length);
              expect(evidence.map((entry) => entry.id)).toEqual(expect.arrayContaining(expectedIds));
              expect(first).toMatchObject({
                id: expectedIds[0],
                parentId: rootDirectory,
                status: SPEC_TREE_EVIDENCE_STATUS.LINKED,
              });
              expect(first?.ref?.path).toBe(evidencePath);
              return;
            }
          }
          return;
        }
      }
    });
  });
});
