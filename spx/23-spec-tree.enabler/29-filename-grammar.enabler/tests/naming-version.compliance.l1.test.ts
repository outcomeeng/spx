import { describe, expect, it } from "vitest";

import {
  canonicalNamingSchemaVersion,
  SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS,
  SPEC_TREE_NAMING_VERSION,
} from "@/lib/spec-tree";
import { highestPositionCases } from "@testing/generators/spec-tree/naming-version-position";
import {
  hardCodedVersion,
  takeFirstVersion,
  takeLastVersion,
} from "@testing/harnesses/spec-tree/naming-version-violations";

describe("dedicated naming-schema version", () => {
  it("is the exposed constant computed by the canonical function from the owned version set", () => {
    expect(SPEC_TREE_NAMING_VERSION).toBe(
      canonicalNamingSchemaVersion(SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS).version,
    );
  });

  it("names a member of the owned version set", () => {
    expect(SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS.map((version) => version.version)).toContain(
      SPEC_TREE_NAMING_VERSION,
    );
  });

  describe("canonical function over tuples built around a chosen highest member", () => {
    for (const { title, versions, highest } of highestPositionCases()) {
      it(`selects the highest member: ${title}`, () => {
        expect(canonicalNamingSchemaVersion(versions).version).toBe(highest.version);
      });
    }
  });

  describe("violating implementations are rejected by the same cases", () => {
    it("a take-the-first body selects a lower member for some tuple", () => {
      const rejected = highestPositionCases().some(({ versions, highest }) =>
        takeFirstVersion(versions).version !== highest.version
      );
      expect(rejected).toBe(true);
    });

    it("a take-the-last body selects a lower member for some tuple", () => {
      const rejected = highestPositionCases().some(({ versions, highest }) =>
        takeLastVersion(versions).version !== highest.version
      );
      expect(rejected).toBe(true);
    });

    it("a hard-coded identifier selects a wrong member for every tuple", () => {
      const rejectedEvery = highestPositionCases().every(({ versions, highest }) =>
        hardCodedVersion(versions).version !== highest.version
      );
      expect(rejectedEvery).toBe(true);
    });

    it("the highest member sits first, last, and between others across the cases", () => {
      const positions = new Set(highestPositionCases().map(({ versions, highest }) => versions.indexOf(highest)));
      expect(positions.size).toBe(highestPositionCases()[0].versions.length);
    });
  });
});
