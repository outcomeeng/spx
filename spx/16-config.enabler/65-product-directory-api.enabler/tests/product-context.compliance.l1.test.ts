import { describe, expect, it } from "vitest";

import { EXECUTE_RUN_CLI_ERROR } from "@/commands/verification-exec/cli";
import { SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX } from "@/interfaces/cli/spec-context-contract";
import { UNRESOLVED_TARGETS_WARNING } from "@/interfaces/cli/test";
import { SPEC_CONTEXT_TARGET_FAILURE_KIND } from "@/lib/spec-tree";
import { arbitraryProductContextCase } from "@testing/generators/config/product-context";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { parseProductContextJsonConfig, productContextTestingConfig } from "@testing/harnesses/product-context/cli";
import { observeDirtyCallerProductContext } from "@testing/harnesses/product-context/compliance";
import { PRODUCT_CONTEXT_TEST_OPTIONS } from "@testing/harnesses/product-context/mapping";
import { observeNestedProductTarget } from "@testing/harnesses/product-context/nested-product";

describe("product context compliance", () => {
  it(
    "resolves config from -C target instead of a dirty unrelated caller worktree",
    PRODUCT_CONTEXT_TEST_OPTIONS,
    async () => {
      const scenario = sampleGeneratedValue(arbitraryProductContextCase());
      const { productDir, result } = await observeDirtyCallerProductContext(scenario);

      expect(result.exitCodes).toEqual([0]);
      expect(result.stderr).toHaveLength(0);
      expect(productContextTestingConfig(parseProductContextJsonConfig(result.stdout, productDir))).toEqual(
        scenario.testing.expected,
      );
    },
  );

  it(
    "nested-product-target: under -C naming a nested product, config show, validation markdown, spec status, spec context show, test and verification test run read that product, and an operand outside it fails unresolved",
    PRODUCT_CONTEXT_TEST_OPTIONS,
    async () => {
      const enclosing = sampleGeneratedValue(arbitraryProductContextCase());
      const inner = sampleGeneratedValue(
        arbitraryProductContextCase().filter((candidate) =>
          JSON.stringify(candidate.testing.expected) !== JSON.stringify(enclosing.testing.expected)
        ),
      );
      const observation = await observeNestedProductTarget({ enclosing, inner });

      expect(observation.config.exitCodes).toEqual([0]);
      expect(
        productContextTestingConfig(
          parseProductContextJsonConfig(observation.config.stdout, observation.innerProductDir),
        ),
      ).toEqual(inner.testing.expected);

      const markdownReport = observation.markdown.stdout + observation.markdown.stderr;
      expect(markdownReport).toContain(observation.innerOnlyMarkdownFile);
      expect(markdownReport).not.toContain(observation.enclosingOnlyMarkdownFile);

      expect(observation.status.exitCodes).toEqual([]);
      expect(observation.status.stdout).not.toContain(observation.droppedNode);

      expect(observation.context.exitCodes).toEqual([]);
      const contextLines = observation.context.stdout.split("\n");
      expect(contextLines).toContain(observation.innerTitleLine);
      expect(contextLines).not.toContain(observation.enclosingTitleLine);

      expect(observation.outsideOperand.exitCodes.some((exitCode) => exitCode !== 0)).toBe(true);
      expect(observation.outsideOperand.stderr).toContain(
        SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[SPEC_CONTEXT_TARGET_FAILURE_KIND.UNRESOLVED],
      );

      const testReport = observation.testOutsideOperand.stdout + observation.testOutsideOperand.stderr;
      expect(testReport).toContain(`${UNRESOLVED_TARGETS_WARNING}:\n${observation.outsideNodeOperand}`);

      expect(observation.verificationOutsideOperand.exitCodes.some((exitCode) => exitCode !== 0)).toBe(true);
      expect(observation.verificationOutsideOperand.stderr).toContain(EXECUTE_RUN_CLI_ERROR.UNRESOLVED_OPERANDS);
    },
  );
});
