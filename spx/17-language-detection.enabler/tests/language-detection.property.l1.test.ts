import { describe, expect, it } from "vitest";

import { detectLanguages, PYTHON_MARKER, TYPESCRIPT_MARKER } from "@/validation/discovery/language-finder";
import { arbitraryLanguageDetectionFileView } from "@testing/generators/language-detection/language-detection";
import { createControlledFilePresence } from "@testing/harnesses/language-detection/language-detection";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("detectLanguages — properties", () => {
  it("produces the same language set for the same product root and file view", () => {
    assertProperty(
      arbitraryLanguageDetectionFileView(),
      (view) => {
        const first = detectLanguages(view.productDir, createControlledFilePresence(view.existingPaths));
        const second = detectLanguages(view.productDir, createControlledFilePresence(view.existingPaths));

        expect(second).toEqual(first);
        expect(first.typescript.present).toBe(view.rootFileNames.includes(TYPESCRIPT_MARKER));
        expect(first.python.present).toBe(view.rootFileNames.includes(PYTHON_MARKER));
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
