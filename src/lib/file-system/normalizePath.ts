/**
 * Normalize path separators for cross-platform consistency
 *
 * Converts Windows backslashes to forward slashes for consistent path handling
 * across different operating systems.
 *
 * @param filepath - Path to normalize
 * @returns Normalized path with forward slashes
 *
 * @example
 * ```typescript
 * normalizePath("C:\\Users\\test\\specs"); // Returns: "C:/Users/test/specs"
 * normalizePath("/home/user/specs");      // Returns: "/home/user/specs"
 * ```
 */

export function normalizePath(filepath: string): string {
  // Replace all backslashes with forward slashes for cross-platform consistency
  return filepath.replace(/\\/g, "/");
}
