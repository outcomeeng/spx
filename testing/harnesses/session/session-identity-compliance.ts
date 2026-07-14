import { describe, expect, it } from "vitest";

import { parseSessionMetadata } from "@/domains/session/list";
import {
  generateSessionId,
  SESSION_ID_FORBIDDEN_FILENAME_CHARACTER,
  SESSION_ID_PATTERN,
  SESSION_ID_SEPARATOR,
} from "@/domains/session/timestamp";
import {
  arbitrarySessionMetadataUnknownKeyScenario,
  arbitraryValidSessionInstant,
} from "@testing/generators/session/session";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

export function registerSessionIdentityComplianceEvidence(): void {
  describe("session identity compliance", () => {
    it("ALWAYS: session IDs use the governed separators", () => {
      assertProperty(
        arbitraryValidSessionInstant(),
        (instant) => {
          const id = generateSessionId({ now: () => instant });

          expect(id).toMatch(SESSION_ID_PATTERN);
          expect(id.split(SESSION_ID_SEPARATOR)).toHaveLength(2);
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });

    it("NEVER: session IDs contain forbidden filename characters", () => {
      assertProperty(
        arbitraryValidSessionInstant(),
        (instant) => {
          expect(generateSessionId({ now: () => instant })).not.toContain(SESSION_ID_FORBIDDEN_FILENAME_CHARACTER);
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });

    it("NEVER: parsed metadata contains a key outside the declared shape", () => {
      assertProperty(
        arbitrarySessionMetadataUnknownKeyScenario(),
        ({ content, unknownKey }) => {
          const metadata = parseSessionMetadata(content) as unknown as Record<string, unknown>;

          expect(Object.hasOwn(metadata, unknownKey)).toBe(false);
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });
  });
}
