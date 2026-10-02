import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  RUNTIME_CONFIG_FIELDS,
  RUNTIME_EVENT_NAMESPACE_DEFAULT,
  runtimeConfigDescriptor,
} from "@/lib/agent-run-journal/config";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";

describe("runtime config descriptor validates its eventNamespace field", () => {
  it("resolves an absent eventNamespace to the declared default", () => {
    const result = runtimeConfigDescriptor.validate({});

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.eventNamespace).toBe(RUNTIME_EVENT_NAMESPACE_DEFAULT);
  });

  it("resolves a valid non-blank eventNamespace to itself", () => {
    fc.assert(
      fc.property(arbitraryDomainLiteral(), (namespace) => {
        const result = runtimeConfigDescriptor.validate({
          [RUNTIME_CONFIG_FIELDS.EVENT_NAMESPACE]: namespace,
        });
        return result.ok && result.value.eventNamespace === namespace;
      }),
    );
  });

  it("rejects a blank or non-string eventNamespace against its non-empty-string contract", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(""),
          fc.stringMatching(/^\s+$/),
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
        ),
        (invalid) =>
          runtimeConfigDescriptor.validate({ [RUNTIME_CONFIG_FIELDS.EVENT_NAMESPACE]: invalid }).ok === false,
      ),
    );
  });

  it("rejects a runtime section that is not an object", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null), fc.array(fc.anything())),
        (invalid) => runtimeConfigDescriptor.validate(invalid).ok === false,
      ),
    );
  });
});
