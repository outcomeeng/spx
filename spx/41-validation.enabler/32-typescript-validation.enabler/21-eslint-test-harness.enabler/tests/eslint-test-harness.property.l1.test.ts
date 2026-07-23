import { describe, expect, it } from "vitest";

import {
  validationNonnumericRuleConfig,
  validationNumericArrayRuleConfig,
  validationNumericRuleConfig,
} from "@testing/generators/validation/ast-enforcement";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { severityOf } from "@testing/harnesses/validation/eslint";

describe("eslint rule-tester harness — severityOf", () => {
  it("reads every numeric rule config as its severity", () => {
    assertProperty(
      validationNumericRuleConfig(),
      (severity) => {
        expect(severityOf(severity)).toBe(severity);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("reads every numeric array head as its severity", () => {
    assertProperty(
      validationNumericArrayRuleConfig(),
      ({ config, severity }) => {
        expect(severityOf(config)).toBe(severity);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("maps every nonnumeric config to no severity", () => {
    assertProperty(
      validationNonnumericRuleConfig(),
      (config) => {
        expect(severityOf(config)).toBeUndefined();
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
