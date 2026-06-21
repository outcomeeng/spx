import { describe, expect, it } from "vitest";

import { SESSION_FRONT_MATTER_CLOSE, SESSION_FRONT_MATTER_OPEN } from "@/domains/session/create";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { parseFrontMatter } from "@testing/harnesses/session/session-store";

describe("session-store test harness — scenarios", () => {
  it("parseFrontMatter carries a frontmatter key into the returned record", () => {
    const key = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const value = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const content = `${SESSION_FRONT_MATTER_OPEN}${key}: ${value}${SESSION_FRONT_MATTER_CLOSE}`;

    expect(Object.keys(parseFrontMatter(content))).toContain(key);
  });
});
