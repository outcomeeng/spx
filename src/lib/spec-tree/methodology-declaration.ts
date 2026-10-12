import { type MethodologyConfig, methodologyConfigDescriptor } from "@/config/methodology";
import {
  CONFIG_FILE_READ_KIND,
  formatConfigFileAmbiguityError,
  parseConfigFileSections,
  readProductConfigFile,
} from "@/config/product-file";
import type { Result } from "@/config/types";

import type { SpecTreeMethodologyDeclaration } from "./grammar-selection";

/** Reads the methodology declaration of the product configuration at `productDir`. */
export async function readSpecTreeMethodologyDeclaration(
  productDir: string,
): Promise<Result<SpecTreeMethodologyDeclaration>> {
  const detected = await readProductConfigFile(productDir);
  if (!detected.ok) return detected;
  const read = detected.value;
  if (read.kind === CONFIG_FILE_READ_KIND.AMBIGUOUS) {
    return { ok: false, error: formatConfigFileAmbiguityError(read.detected) };
  }
  const sections: Result<Record<string, unknown>> = read.kind === CONFIG_FILE_READ_KIND.ABSENT
    ? { ok: true, value: {} }
    : parseConfigFileSections(read.file);
  if (!sections.ok) return sections;
  const section = sections.value[methodologyConfigDescriptor.section];
  if (section === undefined) return { ok: true, value: methodologyConfigDescriptor.defaults };
  const validated = methodologyConfigDescriptor.validate(section);
  if (!validated.ok) {
    return { ok: false, error: `${methodologyConfigDescriptor.section}: ${validated.error}` };
  }
  const methodology: MethodologyConfig = validated.value;
  return { ok: true, value: methodology };
}
