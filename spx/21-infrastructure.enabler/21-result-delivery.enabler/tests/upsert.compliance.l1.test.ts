import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createLocalDeliveryBackend, deliverySurfaceFileName } from "@/lib/result-delivery";
import { composeScopeDir, defaultStateStoreFileSystem, STATE_STORE_TEXT_ENCODING } from "@/lib/state-store";
import {
  arbitraryDeliveryBody,
  arbitraryDeliveryMarker,
  arbitraryDeliveryScope,
  arbitraryDistinctDeliveryBodies,
  arbitraryDistinctDeliveryMarkers,
  sampleResultDeliveryValue,
} from "@testing/generators/result-delivery";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

async function surfaceFiles(scopeDir: string): Promise<readonly string[]> {
  const entries = await defaultStateStoreFileSystem.readdir(scopeDir, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
}

describe("the local backend upserts one marker-addressed surface", () => {
  it("creates the surface on first delivery and updates it in place on re-delivery", async () => {
    const scope = sampleResultDeliveryValue(arbitraryDeliveryScope());
    const marker = sampleResultDeliveryValue(arbitraryDeliveryMarker());
    const [firstBody, secondBody] = sampleResultDeliveryValue(arbitraryDistinctDeliveryBodies());

    await withTempDir("spx-result-delivery-upsert-", async (surfacesDir) => {
      const backend = createLocalDeliveryBackend({ surfacesDir, fs: defaultStateStoreFileSystem });
      const scopeDir = composeScopeDir(surfacesDir, scope);
      if (!scopeDir.ok) throw new Error(scopeDir.error);
      const surfacePath = join(scopeDir.value, deliverySurfaceFileName(marker));

      const first = await backend.deliver({ scope, marker, body: firstBody });
      expect(first.ok).toBe(true);
      // the first delivery creates exactly one surface, holding the rendered body
      expect(await surfaceFiles(scopeDir.value)).toHaveLength(1);
      expect(await defaultStateStoreFileSystem.readFile(surfacePath, STATE_STORE_TEXT_ENCODING)).toBe(firstBody);

      const second = await backend.deliver({ scope, marker, body: secondBody });
      expect(second.ok).toBe(true);
      // the re-delivery updates that same surface in place rather than adding a second
      expect(await surfaceFiles(scopeDir.value)).toHaveLength(1);
      expect(await defaultStateStoreFileSystem.readFile(surfacePath, STATE_STORE_TEXT_ENCODING)).toBe(secondBody);
    });
  });

  it("addresses a distinct surface for each marker under one scope", async () => {
    const scope = sampleResultDeliveryValue(arbitraryDeliveryScope());
    const [firstMarker, secondMarker] = sampleResultDeliveryValue(arbitraryDistinctDeliveryMarkers());
    const body = sampleResultDeliveryValue(arbitraryDeliveryBody());

    await withTempDir("spx-result-delivery-distinct-", async (surfacesDir) => {
      const backend = createLocalDeliveryBackend({ surfacesDir, fs: defaultStateStoreFileSystem });
      const scopeDir = composeScopeDir(surfacesDir, scope);
      if (!scopeDir.ok) throw new Error(scopeDir.error);

      await backend.deliver({ scope, marker: firstMarker, body });
      await backend.deliver({ scope, marker: secondMarker, body });

      // two markers under one scope address two separate surfaces
      expect(await surfaceFiles(scopeDir.value)).toHaveLength(2);
    });
  });
});
