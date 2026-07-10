import { validationCliComplianceCases } from "@testing/harnesses/validation/cli-scenarios";
import {
  validationPipelineJsonComplianceCases,
  validationPipelineSkipComplianceCases,
} from "@testing/harnesses/validation/pipeline";
import { registerHarnessTestCases } from "@testing/harnesses/vitest-registration";

registerHarnessTestCases([
  ...validationCliComplianceCases,
  ...validationPipelineJsonComplianceCases,
  ...validationPipelineSkipComplianceCases,
]);
