import { describe, it } from "vitest";

import { SUPPORTED_AGENT_CACHE_CASES } from "@testing/generators/diagnose/methodology-context";
import { assertSupportedAgentCacheCase } from "@testing/harnesses/diagnose/methodology-context";

describe("methodology-context supported cache mapping", () => {
  it.each(SUPPORTED_AGENT_CACHE_CASES)("reads the $name methodology cache", assertSupportedAgentCacheCase);
});
