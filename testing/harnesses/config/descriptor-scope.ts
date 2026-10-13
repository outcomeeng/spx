import type { ConfigDescriptor } from "@/config/types";

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
