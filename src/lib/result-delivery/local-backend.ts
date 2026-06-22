import { join } from "node:path";

import type { Result } from "@/config/types";
import { composeScopeDir, sha256Hex, type StateStoreFileSystem } from "@/lib/state-store";

import type { DeliveryBackend, DeliveryRequest } from "./port";

export const DELIVERY_LOCAL = {
  SURFACE_FILE_PREFIX: "surface-",
} as const;

export const DELIVERY_LOCAL_ERROR = {
  SURFACE_WRITE_FAILED: "local delivery surface write failed",
} as const;

export interface LocalDeliveryBackendOptions {
  /** The resolved base directory delivery surfaces persist under. */
  readonly surfacesDir: string;
  /** The injected filesystem boundary from the state module. */
  readonly fs: StateStoreFileSystem;
}

/**
 * The marker-addressed surface file name: a path-safe digest of the marker, so
 * one marker always addresses one surface and a re-delivery overwrites it.
 */
export function deliverySurfaceFileName(marker: string): string {
  return `${DELIVERY_LOCAL.SURFACE_FILE_PREFIX}${sha256Hex(marker)}`;
}

/**
 * A local {@link DeliveryBackend} that persists each delivery as one
 * marker-addressed surface file under a result-scope directory, through the
 * state module's injected filesystem. The first delivery for a marker creates
 * the surface; a later delivery for that marker truncates and rewrites the same
 * file in place rather than adding a second.
 */
export function createLocalDeliveryBackend(options: LocalDeliveryBackendOptions): DeliveryBackend {
  const { surfacesDir, fs } = options;
  return {
    async deliver({ scope, marker, body }: DeliveryRequest): Promise<Result<void>> {
      const scopeDir = composeScopeDir(surfacesDir, scope);
      if (!scopeDir.ok) return scopeDir;
      const surfacePath = join(scopeDir.value, deliverySurfaceFileName(marker));
      try {
        await fs.mkdir(scopeDir.value, { recursive: true });
        await fs.writeFile(surfacePath, body);
        return { ok: true, value: undefined };
      } catch (error) {
        return {
          ok: false,
          error: `${DELIVERY_LOCAL_ERROR.SURFACE_WRITE_FAILED}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
    },
  };
}
