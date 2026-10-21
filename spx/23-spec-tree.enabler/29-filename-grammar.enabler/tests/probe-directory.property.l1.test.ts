import { describe, expect, it } from "vitest";

import { acceptsProbeEntry, SPEC_TREE_METHODOLOGY_LINE } from "@/lib/spec-tree";
import { PROBE_DIRECTORY_GENERATOR } from "@testing/generators/spec-tree/lane-directories";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { recognitionOptionsForLine } from "@testing/harnesses/spec-tree/filename-grammar";

const [FOUR_ZERO_VERSION] = recognitionOptionsForLine(SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO).selectedVersions;

describe("the probe lane of the 4.0 naming-schema version", () => {
  it("accepts every probe directory, protocol file, artifact file, and runs directory the stated form composes", () => {
    assertProperty(
      PROBE_DIRECTORY_GENERATOR.accepted(),
      ({ pathFromNode, entryKind }) => {
        expect({ pathFromNode, accepted: acceptsProbeEntry(FOUR_ZERO_VERSION, pathFromNode, entryKind) }).toEqual({
          pathFromNode,
          accepted: true,
        });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("accepts an entry exactly when it has the stated form and rejects every other entry", () => {
    assertProperty(
      PROBE_DIRECTORY_GENERATOR.candidate(),
      ({ pathFromNode, entryKind, accepted }) => {
        expect({ pathFromNode, accepted: acceptsProbeEntry(FOUR_ZERO_VERSION, pathFromNode, entryKind) }).toEqual({
          pathFromNode,
          accepted,
        });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
