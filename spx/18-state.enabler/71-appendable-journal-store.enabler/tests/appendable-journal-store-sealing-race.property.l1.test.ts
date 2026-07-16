import { describe, it } from "vitest";

import { assertProperty } from "@testing/harnesses/property/property";
import { APPENDABLE_JOURNAL_SEALING_RACE_PROPERTY } from "@testing/harnesses/state/appendable-journal-store";

describe("appendable journal store — append and seal race property", () => {
  it("includes every successful append in the sealed aggregate", async () => {
    await assertProperty(
      APPENDABLE_JOURNAL_SEALING_RACE_PROPERTY.arbitrary,
      APPENDABLE_JOURNAL_SEALING_RACE_PROPERTY.predicate,
      APPENDABLE_JOURNAL_SEALING_RACE_PROPERTY.classification,
    );
  });
});
