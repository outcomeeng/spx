import { allowlistExistingHarnessPropertyCases } from "@testing/harnesses/literal-reuse/allowlist-existing";
import { registerHarnessTestCases } from "@testing/harnesses/vitest-registration";

registerHarnessTestCases(allowlistExistingHarnessPropertyCases);
