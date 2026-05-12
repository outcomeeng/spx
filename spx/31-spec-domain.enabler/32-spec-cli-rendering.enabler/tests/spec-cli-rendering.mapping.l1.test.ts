import { describe, expect, it } from "vitest";

import { OUTPUT_FORMAT, SPEC_STATUS_TABLE_HEADER, statusCommand } from "@/commands/spec/status";
import { SPEC_TREE_NODE_STATE } from "@/lib/spec-tree";
import { KIND_REGISTRY } from "@/lib/spec-tree/config";
import { buildRepresentativeFixture, createSource } from "@testing/generators/spec-tree/spec-tree";

describe("spec status rendering", () => {
  it("maps spec-tree projections to text, table, and markdown output", async () => {
    const fixture = buildRepresentativeFixture(KIND_REGISTRY);
    const source = createSource([fixture.root, fixture.child]);

    const text = await statusCommand({ source });
    const table = await statusCommand({ source, format: OUTPUT_FORMAT.TABLE });
    const markdown = await statusCommand({ source, format: OUTPUT_FORMAT.MARKDOWN });

    expect(text).toContain(KIND_REGISTRY[fixture.root.kind].label);
    expect(text).toContain(fixture.root.id);
    expect(text).toContain(fixture.child.id);
    expect(text).toContain(SPEC_TREE_NODE_STATE.DECLARED);
    expect(table).toContain(SPEC_STATUS_TABLE_HEADER);
    expect(table).toContain(fixture.root.id);
    expect(table).toContain(fixture.child.id);
    expect(markdown).toContain(`- ${KIND_REGISTRY[fixture.root.kind].label}`);
    expect(markdown).toContain(fixture.root.id);
    expect(markdown).toContain(fixture.child.id);
  });
});
