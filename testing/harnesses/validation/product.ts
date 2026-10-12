import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { stringify } from "yaml";

import { CONFIG_FILENAMES } from "@/config/filenames";
import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION } from "@/config/methodology";
import type { Config } from "@/config/types";
import { SPEC_TREE_CONFIG, SPEC_TREE_METHODOLOGY_LINE } from "@/lib/spec-tree";

/** The methodology declaration of a validation fixture product that holds a spec tree: the 3.2 line. */
export const VALIDATION_PRODUCT_METHODOLOGY: Config = {
  [METHODOLOGY_SECTION]: { [METHODOLOGY_CONFIG_FIELDS.VERSION]: SPEC_TREE_METHODOLOGY_LINE.THREE_TWO },
};

function holdsSpecTree(productDir: string): boolean {
  return existsSync(join(productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY));
}

/**
 * Writes the methodology declaration into a product directory, as the product's default-format config file,
 * only where the product holds a spec tree: an `spx/` directory, the condition under which the lint policy and
 * the spec-tree read require a declaration. A product without an `spx/` directory stays undeclared.
 */
export async function writeValidationProductDeclaration(productDir: string): Promise<void> {
  if (holdsSpecTree(productDir)) {
    await writeFile(join(productDir, CONFIG_FILENAMES.yaml), stringify(VALIDATION_PRODUCT_METHODOLOGY));
  }
}
