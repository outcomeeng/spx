import { METHODOLOGY_CONFIG_FIELDS } from "@/config/methodology";
import type { SegmentOrderGovernanceCase } from "@testing/generators/spec-tree/segment-order-governance";
import { type CurrentSpecTreeEnv, withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { methodologyTreeConfig } from "@testing/harnesses/spec/context";

/**
 * Materializes the case's tree under a product declaring the case's methodology line and hands the
 * callback the environment; the callback owns every predicate.
 */
export function withSegmentOrderGovernanceEnv(
  governance: SegmentOrderGovernanceCase,
  callback: (env: CurrentSpecTreeEnv) => Promise<void>,
): Promise<void> {
  return withSpecTreeEnv(
    methodologyTreeConfig({ [METHODOLOGY_CONFIG_FIELDS.VERSION]: governance.line }),
    async (env) => {
      for (const [path, text] of Object.entries(governance.files)) await env.writeRaw(path, text);
      await callback(env);
    },
  );
}
