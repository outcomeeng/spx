import type { Result } from "@/config/types";

import { resolveMethodologyConfig } from "../config/methodology-resolution";
import type { SpecTreeMethodologyDeclaration } from "./spec-tree/grammar-selection";

/**
 * Reads the methodology declaration of the product configuration at `productDir`
 * through the config module's one resolver of that declaration.
 */
export function readSpecTreeMethodologyDeclaration(
  productDir: string,
): Promise<Result<SpecTreeMethodologyDeclaration>> {
  return resolveMethodologyConfig(productDir);
}
