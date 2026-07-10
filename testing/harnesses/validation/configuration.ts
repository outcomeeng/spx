import { VALIDATION_ENABLED_FIELD, validationConfigDescriptor } from "@/validation/config/descriptor";
import type { Config } from "@testing/harnesses/spec-tree/spec-tree";

export function validationConfigSection(section: string, enabled: boolean): Config {
  return {
    [validationConfigDescriptor.section]: {
      [section]: {
        [VALIDATION_ENABLED_FIELD]: enabled,
      },
    },
  };
}
