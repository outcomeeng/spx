import { describe, expect, it } from "vitest";

import { classifySpecTreePath } from "@/lib/spec-tree";
import { SKILL_CONFORMANCE_LANE_GENERATOR } from "@testing/generators/spec-tree/skill-conformance";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("skill-conformance oracle knowledge roots and probe directories under the 4.0 version", () => {
  it("maps every path beneath an admitted knowledge root to valid", () => {
    assertProperty(
      SKILL_CONFORMANCE_LANE_GENERATOR.knowledgeBeneathFourZero(),
      ({ record, context, options, verdict }) => {
        expect({ path: record.relativePath, verdict: classifySpecTreePath(record, context, options) }).toEqual({
          path: record.relativePath,
          verdict,
        });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("maps probe-lane entries valid exactly when the probe directory form composes them, and foreign otherwise", () => {
    assertProperty(
      SKILL_CONFORMANCE_LANE_GENERATOR.probeLaneFourZero(),
      ({ record, context, options, verdict }) => {
        expect({ path: record.relativePath, verdict: classifySpecTreePath(record, context, options) }).toEqual({
          path: record.relativePath,
          verdict,
        });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});

describe("skill-conformance oracle knowledge roots and probe directories without the 4.0 version", () => {
  it("maps every path beneath a knowledge directory to foreign", () => {
    assertProperty(
      SKILL_CONFORMANCE_LANE_GENERATOR.knowledgeBeneathThreeX(),
      ({ record, context, options, verdict }) => {
        expect({ path: record.relativePath, verdict: classifySpecTreePath(record, context, options) }).toEqual({
          path: record.relativePath,
          verdict,
        });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("maps every path beneath a probes directory to foreign", () => {
    assertProperty(
      SKILL_CONFORMANCE_LANE_GENERATOR.probeLaneThreeX(),
      ({ record, context, options, verdict }) => {
        expect({ path: record.relativePath, verdict: classifySpecTreePath(record, context, options) }).toEqual({
          path: record.relativePath,
          verdict,
        });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
