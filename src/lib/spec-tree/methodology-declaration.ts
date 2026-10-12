import type { Result } from "@/config/types";

import type { SpecTreeMethodologyDeclaration } from "./grammar-selection";

/**
 * Reads the methodology declaration of the product configuration at `productDir`
 * through the config module's one resolver of that declaration.
 *
 * The resolver loads on demand: the library surface loads where `@/` imports do not
 * resolve, and the config module reaches the library through its registry.
 */
export async function readSpecTreeMethodologyDeclaration(
  productDir: string,
): Promise<Result<SpecTreeMethodologyDeclaration>> {
  const { resolveMethodologyConfig } = await import("@/config/methodology-placement");
  return resolveMethodologyConfig(productDir);
}
