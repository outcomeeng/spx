import { resolveMethodologyConfig } from "@/config/methodology-resolution";
import type { Result } from "@/config/types";

import type { SpecTreeMethodologyDeclaration } from "./grammar-selection";

/**
 * Reads the methodology declaration of the product configuration at `productDir`
 * through the config module's one resolver of that declaration.
 */
export function readSpecTreeMethodologyDeclaration(
  productDir: string,
): Promise<Result<SpecTreeMethodologyDeclaration>> {
  return resolveMethodologyConfig(productDir);
}
