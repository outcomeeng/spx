import { withTempDir } from "@testing/harnesses/with-temp-dir";

const PERMISSIONS_TEMP_DIR_PREFIX = "spx-claude-permissions-";

export function withPermissionsTempDir<T>(
  callback: (productDir: string) => Promise<T>,
): Promise<T> {
  return withTempDir(PERMISSIONS_TEMP_DIR_PREFIX, callback);
}
