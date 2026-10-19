import { describe, expect, it } from "vitest";

import {
  createFilesystemSpecTreeSource,
  readSpecTree,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_EVIDENCE_FILE,
  SPEC_TREE_EVIDENCE_STATUS,
} from "@/lib/spec-tree";
import {
  SPEC_TREE_CASE_TITLE,
  SPEC_TREE_SOURCE_MAPPING_CASE_KIND,
  specTreeConfigForLine,
  specTreeSourceMappingCases,
} from "@testing/generators/spec-tree/spec-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  ambiguousEvidenceFileName,
  evidenceFileName,
  evidenceFilePath,
  isEvidenceEntry,
  productRelativePath,
  specTreePath,
  writeSourceFormTree,
} from "@testing/harnesses/spec-tree/spec-tree-source";

describe("SpecTreeSource mappings", () => {
  it.each(specTreeSourceMappingCases())(SPEC_TREE_CASE_TITLE, async (testCase) => {
    await withSpecTreeEnv(specTreeConfigForLine(testCase.form.line), async (env) => {
      const tree = await writeSourceFormTree(env, testCase.form);
      const { product, root, child, decision } = env.fixture;
      const productPath = productRelativePath(tree.productFile);
      const rootSpecPath = productRelativePath(tree.rootDirectory, `${root.slug}${testCase.form.specFileSuffix}`);
      const childId = specTreePath(tree.rootDirectory, tree.childDirectory);
      const childSpecPath = productRelativePath(childId, `${child.slug}${testCase.form.specFileSuffix}`);
      switch (testCase.kind) {
        case SPEC_TREE_SOURCE_MAPPING_CASE_KIND.PRODUCT_RELATIVE_REFS: {
          const excludedDirectories = [tree.peerDirectory, childId];
          const includedText = await env.readFile(rootSpecPath);
          const source = createFilesystemSpecTreeSource({
            productDir: env.productDir,
            includePath: (path) => excludedDirectories.every((directory) => !path.includes(directory)),
          });
          const snapshot = await readSpecTree({ source });
          const ref = snapshot.allNodes[0]?.ref;
          expect(ref).toBeDefined();
          expect(snapshot.allNodes.map((node) => node.id)).toEqual([tree.rootDirectory]);
          expect(ref?.path).toBe(rootSpecPath);
          expect(snapshot.product?.ref?.path).toBe(productPath);
          expect(source.readText).toBeDefined();
          await expect(source.readText?.(ref!)).resolves.toBe(includedText);
          return;
        }
        case SPEC_TREE_SOURCE_MAPPING_CASE_KIND.RECOGNIZED_ENTRY_ROLE: {
          const snapshot = await readSpecTree({ source: env.filesystemSource() });
          switch (testCase.entryType) {
            case SPEC_TREE_ENTRY_TYPE.PRODUCT:
              expect(snapshot.product?.id).toBe(tree.productFile);
              expect(snapshot.product?.title).toBe(product.title);
              expect(snapshot.product?.ref?.path).toBe(productPath);
              return;
            case SPEC_TREE_ENTRY_TYPE.NODE: {
              const rootNode = snapshot.allNodes.find((node) => node.id === tree.rootDirectory);
              const childNode = snapshot.allNodes.find((node) => node.id === childId);
              expect(rootNode?.slug).toBe(root.slug);
              expect(rootNode?.orderSegments).toEqual(root.orderSegments);
              expect(rootNode?.parentId).toBeUndefined();
              expect(rootNode?.ref?.path).toBe(rootSpecPath);
              expect(childNode?.slug).toBe(child.slug);
              expect(childNode?.orderSegments).toEqual(child.orderSegments);
              expect(childNode?.parentId).toBe(tree.rootDirectory);
              expect(childNode?.ref?.path).toBe(childSpecPath);
              return;
            }
            case SPEC_TREE_ENTRY_TYPE.DECISION: {
              const [recognized] = snapshot.decisions;
              expect(snapshot.decisions).toHaveLength(1);
              expect(recognized?.id).toBe(specTreePath(tree.rootDirectory, tree.decisionFile));
              expect(recognized?.parentId).toBe(tree.rootDirectory);
              expect(recognized?.kind).toBe(decision.kind);
              expect(recognized?.slug).toBe(decision.slug);
              expect(recognized?.orderSegments).toEqual(decision.orderSegments);
              expect(recognized?.ref?.path).toBe(productRelativePath(tree.rootDirectory, tree.decisionFile));
              return;
            }
            case SPEC_TREE_ENTRY_TYPE.EVIDENCE: {
              const evidenceFiles = Object.values(SPEC_TREE_EVIDENCE_FILE.TAILS).map((tail) => evidenceFileName(tail));
              for (const evidenceFile of evidenceFiles) {
                await env.writeRaw(evidenceFilePath(tree.rootDirectory, evidenceFile), "");
              }
              await env.writeRaw(
                `${evidenceFilePath(tree.rootDirectory, evidenceFiles[0])}${testCase.form.productSuffix}`,
                "",
              );
              await env.writeRaw(evidenceFilePath(tree.rootDirectory, ambiguousEvidenceFileName()), "");
              const evidence = (await readSpecTree({ source: env.filesystemSource() })).entries.filter(
                isEvidenceEntry,
              );
              expect(evidence).toHaveLength(evidenceFiles.length);
              for (const evidenceFile of evidenceFiles) {
                const recognized = evidence.find((entry) =>
                  entry.id === specTreePath(tree.rootDirectory, SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME, evidenceFile)
                );
                expect(recognized).toMatchObject({
                  parentId: tree.rootDirectory,
                  status: SPEC_TREE_EVIDENCE_STATUS.LINKED,
                });
                expect(recognized?.ref?.path).toBe(evidenceFilePath(tree.rootDirectory, evidenceFile));
              }
              return;
            }
          }
          return;
        }
      }
    });
  });
});
