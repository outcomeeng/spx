import { resolveConfig } from "@/config/index";
import { productionRegistry } from "@/config/registry";
import type { ConfigDescriptor } from "@/config/types";
import {
  CONFIG_TEST_GENERATOR,
  type GeneratedModeDescriptor,
  sampleConfigTestValue,
} from "@testing/generators/config/descriptors";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

type ResolutionObservation = Awaited<ReturnType<typeof resolveConfig>>;

export type DescriptorDefaultsObservation = {
  readonly section: string;
  readonly defaults: unknown;
  readonly roundTrip: ReturnType<ConfigDescriptor<unknown>["validate"]>;
};

/** The result of each descriptor's own validator applied to that descriptor's own declared defaults. */
export function observeDescriptorDefaults(
  descriptors: readonly ConfigDescriptor<unknown>[],
): readonly DescriptorDefaultsObservation[] {
  return descriptors.map((descriptor) => ({
    section: descriptor.section,
    defaults: descriptor.defaults,
    roundTrip: descriptor.validate(descriptor.defaults),
  }));
}

export type ProductionSectionShadowObservation = {
  readonly section: string;
  readonly shadow: GeneratedModeDescriptor;
  readonly scopedDefaulted: ResolutionObservation;
  readonly scopedComposed: ResolutionObservation;
  readonly scopedRejected: ResolutionObservation;
  readonly unscopedDefaulted: ResolutionObservation;
  readonly unscopedComposed: ResolutionObservation;
};

type ObservationConsumer = (observation: ProductionSectionShadowObservation) => void | Promise<void>;

/**
 * For each production descriptor section, resolves config content for that section through a generated
 * test-scoped descriptor registered under the same section (scoped) and through the production registry
 * (unscoped), and hands each resolution to the consumer without judging it.
 */
export async function forEachProductionSectionShadowObservation(consume: ObservationConsumer): Promise<void> {
  for (const { section } of productionRegistry) {
    const shadow = sampleConfigTestValue(CONFIG_TEST_GENERATOR.shadowModeDescriptor(section));

    const defaulted = await withTestEnv({}, async ({ productDir }) => ({
      scoped: await resolveConfig(productDir, [shadow.descriptor]),
      unscoped: await resolveConfig(productDir),
    }));
    const composed = await withTestEnv({ [section]: shadow.override }, async ({ productDir }) => ({
      scoped: await resolveConfig(productDir, [shadow.descriptor]),
      unscoped: await resolveConfig(productDir),
    }));
    const rejected = await withTestEnv({ [section]: shadow.invalid }, async ({ productDir }) => ({
      scoped: await resolveConfig(productDir, [shadow.descriptor]),
    }));

    await consume({
      section,
      shadow,
      scopedDefaulted: defaulted.scoped,
      scopedComposed: composed.scoped,
      scopedRejected: rejected.scoped,
      unscopedDefaulted: defaulted.unscoped,
      unscopedComposed: composed.unscoped,
    });
  }
}
