import { describe, expect, it } from "vitest";

import {
  RUNTIME_CONFIG_FIELDS,
  RUNTIME_EVENT_NAMESPACE_DEFAULT,
  runtimeConfigDescriptor,
} from "@/lib/agent-run-journal/config";
import {
  arbitraryInvalidEventNamespace,
  arbitraryNonObjectRuntimeSection,
} from "@testing/generators/agent-run-journal";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("runtime config descriptor validates its eventNamespace field", () => {
  it("resolves an absent eventNamespace to the declared default", () => {
    const result = runtimeConfigDescriptor.validate({});

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.eventNamespace).toBe(RUNTIME_EVENT_NAMESPACE_DEFAULT);
  });

  it("resolves a valid non-blank eventNamespace to itself", () => {
    assertProperty(
      arbitraryDomainLiteral(),
      (namespace) => {
        const result = runtimeConfigDescriptor.validate({
          [RUNTIME_CONFIG_FIELDS.EVENT_NAMESPACE]: namespace,
        });
        return result.ok && result.value.eventNamespace === namespace;
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects a blank or non-string eventNamespace against its non-empty-string contract", () => {
    assertProperty(
      arbitraryInvalidEventNamespace(),
      (invalid) => !runtimeConfigDescriptor.validate({ [RUNTIME_CONFIG_FIELDS.EVENT_NAMESPACE]: invalid }).ok,
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects a runtime section that is not an object", () => {
    assertProperty(
      arbitraryNonObjectRuntimeSection(),
      (invalid) => !runtimeConfigDescriptor.validate(invalid).ok,
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
