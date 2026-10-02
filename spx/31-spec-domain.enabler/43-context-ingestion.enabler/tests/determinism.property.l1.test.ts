import { describe, expect, it } from "vitest";

import { arbitraryContextDeterminismCase } from "@testing/generators/spec-tree/context-target";
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
    "produces byte-identical list and show output across repeated runs on identical tree content, methodology resources, options, and targets",
    async () => {
      await assertProperty(
        arbitraryContextDeterminismCase(specTreeKindsConfig()),
        async ({ fixture, extraDecision, extraNode, migrating, methodologySlug }) => {
          // An open migration lets the materialized fixture's decisions, which
          // carry no target-version opening, project through the declared
          // source-version fallback in both the targetless and targeted runs.
          await withSpecTreeEnv(methodologyTreeConfig(migrating.section), async (env) => {
            await env.materialize();
            const tree = await writeMethodologyTree(env, { version: migrating.target, slug: methodologySlug });
            await env.writeRaw(extraNode.fixturePath, extraNode.contents);
            await env.writeRaw(extraDecision.fixturePath, extraDecision.contents);
            const snapshot = await env.readFilesystemSnapshot();
            const target = snapshot.allNodes[0];
            const targets = [target.id];
            const cwd = env.productDir;
            const runs = [
              () => contextListJson({ targets, cwd }),
              () => contextListText({ targets, cwd }),
              () => contextShowText({ targets, cwd }),
              () => contextShowJson({ targets, cwd }),
              () => contextShowText({ targets: [], cwd }),
              () =>
                contextShowText({
                  targets,
                  cwd,
                  methodology: true,
                  codingAgent: tree.codingAgent,
                  methodologyTreeRoot: tree.treeRoot,
                }),
            ];
            for (const run of runs) {
              expect(await run()).toBe(await run());
            }
          }, { fixture });
        },
        PROPERTY_CLASSIFICATION.SMALL_L1,
      );
    },
    propertyTestEnvelopeTimeoutMs(PROPERTY_CLASSIFICATION.SMALL_L1),
  );
});
