import { resolveConfig } from "@/config";
import { METHODOLOGY_SECTION, type MethodologyConfig, methodologyConfigDescriptor } from "@/config/methodology";

import { NODE_STATUS_CLAIM_SHAPE, type NodeStatusClaimShape } from "./claim";

/** The first methodology line whose claim is the 4.0 shape. */
const CURRENT_CLAIM_MAJOR = 4;
const VERSION_COMPONENT_SEPARATOR = ".";
const DECIMAL_RADIX = 10;

/** The claim shape of a methodology version; a product that declares none writes the version-1 shape. */
export function claimShapeOfMethodologyVersion(version: string | undefined): NodeStatusClaimShape {
  if (version === undefined) return NODE_STATUS_CLAIM_SHAPE.VERSION_1;
  const major = Number.parseInt(version.split(VERSION_COMPONENT_SEPARATOR)[0] ?? "", DECIMAL_RADIX);
  return Number.isNaN(major) || major < CURRENT_CLAIM_MAJOR
    ? NODE_STATUS_CLAIM_SHAPE.VERSION_1
    : NODE_STATUS_CLAIM_SHAPE.CURRENT;
}

/** The claim shape of the methodology version the product declares in its configuration file. */
export async function declaredNodeStatusClaimShape(productDir: string): Promise<NodeStatusClaimShape> {
  const resolved = await resolveConfig(productDir, [methodologyConfigDescriptor]);
  if (!resolved.ok) throw new Error(resolved.error);
  const methodology = resolved.value[METHODOLOGY_SECTION] as MethodologyConfig;
  return claimShapeOfMethodologyVersion(methodology.version);
}
