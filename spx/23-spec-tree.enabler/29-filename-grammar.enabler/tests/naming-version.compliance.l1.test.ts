import { describe, expect, it } from "vitest";

import {
  canonicalNamingSchemaVersion,
  SPEC_TREE_NAMING_SCHEMA_VERSIONS,
  SPEC_TREE_NAMING_VERSION,
} from "@/lib/spec-tree";

describe("dedicated naming-schema version", () => {
  it("is exposed through the library surface as a non-empty string", () => {
    expect(SPEC_TREE_NAMING_VERSION.length).toBeGreaterThan(0);
  });

  it("names a member of the owned naming-schema version tuple", () => {
    const versions = SPEC_TREE_NAMING_SCHEMA_VERSIONS.map((version) => version.version);
    expect(versions).toContain(SPEC_TREE_NAMING_VERSION);
  });

  it("is computed as the canonical version's identifier, not declared apart from the tuple", () => {
    expect(SPEC_TREE_NAMING_VERSION).toBe(canonicalNamingSchemaVersion(SPEC_TREE_NAMING_SCHEMA_VERSIONS).version);
  });
});
