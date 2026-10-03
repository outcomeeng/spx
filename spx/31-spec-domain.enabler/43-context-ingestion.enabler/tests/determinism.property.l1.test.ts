import { describe, expect, it } from "vitest";

import { SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";
import { arbitraryContextDeterminismCase } from "@testing/generators/spec-tree/context-target";
import { rootedSpecPath } from "@testing/generators/spec-tree/rich-context";
import {
  assertProperty,
  PROPERTY_CLASSIFICATION,
  propertyTestEnvelopeTimeoutMs,
} from "@testing/harnesses/property/property";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextListJson,
  contextListText,
  contextShowJson,
  contextShowText,
  methodologyTreeConfig,
  specTreeKindsConfig,
  writeMethodologyTree,
} from "@testing/harnesses/spec/context";

describe("spec context determinism", () => {
  it(
    "produces byte-identical list and show output for equal tree content, methodology resources, options, coding agent, and accepted canonical targets",
    async () => {
      await assertProperty(
        arbitraryContextDeterminismCase(specTreeKindsConfig()),
        async ({ fixture, extraDecision, extraNode, migrating, methodologySlug }) => {
          await withSpecTreeEnv(methodologyTreeConfig(migrating.section), async (env) => {
            await env.materialize();
            const tree = await writeMethodologyTree(env, { version: migrating.target, slug: methodologySlug });
            await env.writeRaw(extraNode.fixturePath, extraNode.contents);
            await env.writeRaw(extraDecision.fixturePath, extraDecision.contents);
            const snapshot = await env.readFilesystemSnapshot();
            const target = snapshot.allNodes[0];
            const cwd = env.productDir;
            // Three spellings of one accepted canonical target: the tree-rooted
            // node directory, the same with a trailing separator, and the
            // node's spec file. Equal canonical targets admit no output change.
            const spellings = [
              [rootedSpecPath(target.id)],
              [`${rootedSpecPath(target.id)}${SPEC_TREE_GRAMMAR.PATH_SEPARATOR}`],
              [target.ref?.path ?? rootedSpecPath(target.id)],
            ];
            const runs = [
              (targets: readonly string[]) => contextListJson({ targets, cwd }),
              (targets: readonly string[]) => contextListText({ targets, cwd }),
              (targets: readonly string[]) => contextShowText({ targets, cwd }),
              (targets: readonly string[]) => contextShowJson({ targets, cwd }),
              () => contextShowText({ targets: [], cwd }),
              (targets: readonly string[]) =>
                contextShowText({
                  targets,
                  cwd,
                  methodology: true,
                  codingAgent: tree.codingAgent,
                  methodologyTreeRoot: tree.treeRoot,
                }),
            ];
            for (const run of runs) {
              const first = await run(spellings[0]);
              expect(await run(spellings[0])).toBe(first);
              for (const spelling of spellings.slice(1)) {
                expect(await run(spelling), spelling.join(" ")).toBe(first);
              }
            }
          }, { fixture });
        },
        PROPERTY_CLASSIFICATION.SMALL_L1,
      );
    },
    propertyTestEnvelopeTimeoutMs(PROPERTY_CLASSIFICATION.SMALL_L1),
  );
});
