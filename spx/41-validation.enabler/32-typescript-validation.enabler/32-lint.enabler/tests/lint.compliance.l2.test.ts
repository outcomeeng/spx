import { lintPreflightComplianceCases } from "@testing/harnesses/validation/lint-args-compliance";
import { lintPipelineComplianceCases } from "@testing/harnesses/validation/lint-pipeline";
import { registerHarnessTestCases } from "@testing/harnesses/vitest-registration";

registerHarnessTestCases(lintPipelineComplianceCases);
registerHarnessTestCases(lintPreflightComplianceCases);
