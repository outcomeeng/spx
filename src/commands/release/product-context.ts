import type { ReleaseContextReader } from "@/domains/release/product-context";

/** Reads one product-context snapshot before any release agent is invoked. */
export const readReleaseProductContext: ReleaseContextReader = async () => [];
