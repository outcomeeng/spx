import { releaseTestGeneratorPropertyCases } from "@testing/harnesses/release/release-test-generators";
import { registerHarnessTestCases } from "@testing/harnesses/vitest-registration";

registerHarnessTestCases(releaseTestGeneratorPropertyCases);
