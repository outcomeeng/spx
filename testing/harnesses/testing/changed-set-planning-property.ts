import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  CHANGED_TEST_DIFF_COMMAND,
  CHANGED_TEST_LS_FILES_COMMAND,
  planChangedTestSelection,
} from "@/commands/test/changed-set-planning";
import { SUCCESS_EXIT_CODE } from "@/domains/test";
import { CONFIG_PROCESS_CWD } from "@/lib/config/cwd";
import { GIT_DELETE_STATUS_EXAMPLE, GIT_NULL_RECORD_SEPARATOR } from "@/lib/git/name-status";
import { GIT_ROOT_COMMAND, type GitDependencies } from "@/lib/git/root";
import { KIND_REGISTRY } from "@/lib/spec-tree/config";
import { compareAsciiStrings } from "@/lib/state-store";
import type { RelatedTestDependencies, TestingLanguageDescriptor } from "@/test/languages/types";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import type { TestingRegistry } from "@/test/registry";
import { arbitraryDomainLiteral, arbitrarySourceFilePath } from "@testing/generators/literal/literal";
import { nodeOperand, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";

interface ChangedNodeEntry {
  readonly changedPath: string;
  readonly testPath: string;
}

interface PlannerPropertyInput {
  readonly nodeEntries: readonly ChangedNodeEntry[];
  readonly sourcePaths: readonly string[];
  readonly relatedTestPath: string;
  readonly baseRef: string;
  readonly baseSha: string;
  readonly headSha: string;
}

function arbitraryChangedSpecPath(): fc.Arbitrary<ChangedNodeEntry> {
  return TEST_DISPATCH_GENERATOR.nodePath().chain((node) =>
    TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, node).map((testPath) => {
      const segment = node.split("/").at(-1) ?? node;
      const slug = segment.replace(/^\d+-/, "").replace(KIND_REGISTRY.enabler.suffix, "");
      return {
        changedPath: [nodeOperand(node), slug + ".md"].join("/"),
        testPath,
      };
    })
  );
}

function arbitraryChangedTestPath(): fc.Arbitrary<ChangedNodeEntry> {
  return TEST_DISPATCH_GENERATOR.nodePath().chain((node) =>
    TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, node).map((testPath) => ({
      changedPath: testPath,
      testPath,
    }))
  );
}

function arbitraryRelatedTestPath(): fc.Arbitrary<string> {
  return TEST_DISPATCH_GENERATOR.nodePath().chain((node) =>
    TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, node)
  );
}

function arbitraryPlannerInput(): fc.Arbitrary<PlannerPropertyInput> {
  return fc.record({
    nodeEntries: fc.array(fc.oneof(arbitraryChangedSpecPath(), arbitraryChangedTestPath()), {
      minLength: 1,
      maxLength: 8,
    }),
    sourcePaths: fc.array(arbitrarySourceFilePath(), { minLength: 1, maxLength: 8 }),
    relatedTestPath: arbitraryRelatedTestPath(),
    baseRef: arbitraryDomainLiteral(),
    baseSha: arbitraryDomainLiteral(),
    headSha: arbitraryDomainLiteral(),
  });
}

function nulDelimited(paths: readonly string[]): string {
  return paths.length === 0 ? "" : paths.join(GIT_NULL_RECORD_SEPARATOR) + GIT_NULL_RECORD_SEPARATOR;
}

function nameStatusNulDelimited(paths: readonly string[]): string {
  return nulDelimited(paths.flatMap((path) => [GIT_DELETE_STATUS_EXAMPLE, path]));
}

function successfulGitResult(
  stdout: string,
): { readonly exitCode: number; readonly stdout: string; readonly stderr: string } {
  return { exitCode: SUCCESS_EXIT_CODE, stdout, stderr: "" };
}

function plannerGit(
  changedPaths: readonly string[],
  candidateTestPaths: readonly string[],
  baseSha: string,
  headSha: string,
): GitDependencies {
  return {
    execa: async (_command, args) => {
      if (args.includes(CHANGED_TEST_DIFF_COMMAND)) {
        return successfulGitResult(nameStatusNulDelimited(changedPaths));
      }
      if (args.includes(CHANGED_TEST_LS_FILES_COMMAND)) {
        return successfulGitResult(nulDelimited(candidateTestPaths));
      }
      if (args.includes(GIT_ROOT_COMMAND.REV_PARSE)) {
        return successfulGitResult(args.at(-1) === GIT_ROOT_COMMAND.HEAD ? headSha : baseSha);
      }
      throw new Error("changed-set property harness received an unexpected git command");
    },
  };
}

function relatedDescriptor(relatedTestPath: string): TestingLanguageDescriptor {
  return {
    ...typescriptTestingLanguage,
    relatedTestPaths: async (request) => ({
      testPaths: [relatedTestPath],
      resolvedSourcePaths: request.sourcePaths,
    }),
  };
}

function unreachableRelatedDependencies(): RelatedTestDependencies {
  return {
    runCommand: async () => {
      throw new Error("changed-set property resolver must not invoke a command");
    },
    readFile: async () => {
      throw new Error("changed-set property resolver must not read candidate content");
    },
  };
}

async function plannedTargets(
  input: PlannerPropertyInput,
  changedPaths: readonly string[],
): Promise<readonly string[]> {
  const candidateTestPaths = [
    ...input.nodeEntries.map((entry) => entry.testPath),
    input.relatedTestPath,
  ];
  const registry: TestingRegistry = { languages: [relatedDescriptor(input.relatedTestPath)] };
  const result = await planChangedTestSelection(
    {
      productDir: CONFIG_PROCESS_CWD.read(),
      baseRef: input.baseRef,
      staged: true,
    },
    {
      git: plannerGit(changedPaths, candidateTestPaths, input.baseSha, input.headSha),
      registry,
      relatedDepsFor: unreachableRelatedDependencies,
    },
  );
  expect(result.unresolvedSourceFiles).toEqual([]);
  return result.targets.operands;
}

function expectedTargets(input: PlannerPropertyInput): readonly string[] {
  return [
    ...new Set([
      ...input.nodeEntries.map((entry) => entry.testPath),
      input.relatedTestPath,
    ]),
  ].sort(compareAsciiStrings);
}

export function registerChangedSetPlanningPropertyTests(): void {
  describe("changed-set planning invariants", () => {
    it("resolves a deduplicated union independent of changed-path order and repetition", async () => {
      await assertProperty(
        arbitraryPlannerInput(),
        async (input) => {
          const changedPaths = [
            ...input.nodeEntries.map((entry) => entry.changedPath),
            ...input.sourcePaths,
          ];
          const repeated = [...changedPaths, ...changedPaths].reverse();
          const planned = await plannedTargets(input, changedPaths);
          const repeatedPlanned = await plannedTargets(input, repeated);

          expect(planned).toEqual(expectedTargets(input));
          expect(repeatedPlanned).toEqual(planned);
          expect(new Set(planned).size).toBe(planned.length);
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });
  });
}
