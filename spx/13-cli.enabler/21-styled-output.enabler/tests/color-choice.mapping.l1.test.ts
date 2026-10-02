import { describe, expect, it } from "vitest";

import { resolveColorChoice } from "@/lib/styled-output/styled-output";
import {
  arbitraryFlaggedColorChoice,
  arbitraryNoColorDisabledChoice,
  arbitraryTtyDecidedChoice,
} from "@testing/generators/styled-output/styled-output";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("the color choice resolves by precedence: flag, then NO_COLOR, then TTY", () => {
  it("honors an explicit flag over NO_COLOR and TTY", () => {
    assertProperty(
      arbitraryFlaggedColorChoice(),
      (choice) => {
        expect(resolveColorChoice(choice)).toBe(choice.flag);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("disables color when no flag is set and NO_COLOR is non-empty", () => {
    assertProperty(
      arbitraryNoColorDisabledChoice(),
      (choice) => {
        expect(resolveColorChoice(choice)).toBe(false);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("falls back to TTY status when no flag is set and NO_COLOR is unset or empty", () => {
    assertProperty(
      arbitraryTtyDecidedChoice(),
      (choice) => {
        expect(resolveColorChoice(choice)).toBe(choice.isTty);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
