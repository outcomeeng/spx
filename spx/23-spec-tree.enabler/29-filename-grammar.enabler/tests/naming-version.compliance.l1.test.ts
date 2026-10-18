import { describe, expect, it } from "vitest";

import {
  canonicalNamingSchemaVersion,
  SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS,
  SPEC_TREE_NAMING_VERSION,
} from "@/lib/spec-tree";
import { semverMaximumOracle } from "@testing/generators/spec-tree/naming-schema-version";

describe("dedicated naming-schema version", () => {
  it("is exposed through the library surface as a non-empty string", () => {
    expect(SPEC_TREE_NAMING_VERSION.length).toBeGreaterThan(0);
  });

  it("names a member of the full naming-schema version set", () => {
    const versions = SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS.map((version) => version.version);
    expect(versions).toContain(SPEC_TREE_NAMING_VERSION);
  });

  it("is the maximum of the full naming-schema version set", () => {
    expect(SPEC_TREE_NAMING_VERSION).toBe(semverMaximumOracle(SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS).version);
  });

  it("is computed as the canonical version's identifier, not declared apart from the version set", () => {
    expect(SPEC_TREE_NAMING_VERSION).toBe(
      canonicalNamingSchemaVersion(SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS).version,
    );
  });
});
