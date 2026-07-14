import { describe, it } from "vitest";

import {
  assertSpecContextContentModeCarriesExactBytes,
  assertSpecContextContentModeRejectsInvalidUtf8,
  assertSpecContextContentModeRejectsUnreadableDocument,
  assertSpecContextWithoutContentModeOmitsContentFields,
} from "@testing/harnesses/spec/context";

describe("spec context document content", () => {
  it("carries every read document's exact content, digest, and byte count when content is requested", async () => {
    await assertSpecContextContentModeCarriesExactBytes();
  });

  it("fails naming the exact path when a read document is not valid UTF-8", async () => {
    await assertSpecContextContentModeRejectsInvalidUtf8();
  });

  it("fails naming the exact path when a read document cannot be read", async () => {
    await assertSpecContextContentModeRejectsUnreadableDocument();
  });

  it("omits content fields from every entry when content is not requested", async () => {
    await assertSpecContextWithoutContentModeOmitsContentFields();
  });
});
