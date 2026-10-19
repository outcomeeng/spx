import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  CONFIG_FILE_READ_KIND,
  configFileForFormat,
  parseConfigFileSections,
  readProductConfigFile,
  serializeConfigFileSections,
} from "@/config";
import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION } from "@/config/methodology";
import type { Config } from "@/config/types";
import { SPEC_TREE_CONFIG, SPEC_TREE_METHODOLOGY_LINE, type SpecTreeMethodologyLine } from "@/lib/spec-tree";

/** The methodology declaration of a validation fixture product that holds a spec tree: the 3.2 line. */
export const VALIDATION_PRODUCT_METHODOLOGY: Config = {
  [METHODOLOGY_SECTION]: { [METHODOLOGY_CONFIG_FIELDS.VERSION]: SPEC_TREE_METHODOLOGY_LINE.THREE_TWO },
};

function holdsSpecTree(productDir: string): boolean {
  return existsSync(join(productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY));
}

/**
 * Declares the methodology of a product directory, only where the product holds a spec tree: an `spx/`
 * directory, the condition under which the lint policy and the spec-tree read require a declaration. A product
 * without an `spx/` directory stays undeclared. The product's one config file, in its own format, gains the
 * methodology section only when it lacks one; a product with no config file gains the default-format file.
 */
export async function writeValidationProductDeclaration(
  productDir: string,
  line: SpecTreeMethodologyLine = SPEC_TREE_METHODOLOGY_LINE.THREE_TWO,
): Promise<void> {
  if (!holdsSpecTree(productDir)) return;
  const detected = await readProductConfigFile(productDir);
  if (!detected.ok) throw new Error(detected.error);
  if (detected.value.kind === CONFIG_FILE_READ_KIND.AMBIGUOUS) return;
  const file = detected.value.kind === CONFIG_FILE_READ_KIND.OK ? detected.value.file : configFileForFormat(productDir);
  const sections = parseConfigFileSections(file);
  if (!sections.ok) throw new Error(sections.error);
  if (METHODOLOGY_SECTION in sections.value) return;
  const serialized = serializeConfigFileSections(file.format, {
    ...sections.value,
    [METHODOLOGY_SECTION]: { [METHODOLOGY_CONFIG_FIELDS.VERSION]: line },
  });
  if (!serialized.ok) throw new Error(serialized.error);
  await writeFile(file.path, serialized.value);
}
