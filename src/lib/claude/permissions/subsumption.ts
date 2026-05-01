/**
 * Permission subsumption detection
 *
 * Detects when broader permissions subsume narrower ones:
 * - Bash(git:*) subsumes Bash(git log:*), Bash(git worktree:*), etc.
 * - Read(file_path:/Users/user/Code/**) subsumes Read(file_path:/Users/user/Code/project-a/**)
 */
import { normalizePath } from "@/lib/file-system/normalizePath";
import { parsePermission } from "./parser";
import type { Permission, PermissionCategory, ScopePattern, SubsumptionResult } from "./types";

/**
 * Parse a scope string to extract pattern type and value
 *
 * Determines whether the scope is a command pattern (e.g., "git:*")
 * or a path pattern (e.g., "file_path:/Users/user/Code/**").
 *
 * @param scope - Scope string from permission
 * @returns ScopePattern with type and pattern
 *
 * @example
 * ```typescript
 * parseScopePattern("git:*")
 * // Returns: { type: "command", pattern: "git:*" }
 *
 * parseScopePattern("file_path:/Users/user/Code/**")
 * // Returns: { type: "path", pattern: "/Users/user/Code/**" }
 * ```
 */
export function parseScopePattern(scope: string): ScopePattern {
  // Check if scope contains path indicators
  if (
    scope.includes("file_path:")
    || scope.includes("directory_path:")
    || scope.includes("path:")
  ) {
    // Extract path after the colon
    const colonIndex = scope.indexOf(":");
    const pattern = colonIndex >= 0 ? scope.substring(colonIndex + 1) : scope;
    return { type: "path", pattern };
  }

  // Default to command pattern (e.g., "git:*", "npm:*")
  return { type: "command", pattern: scope };
}

/**
 * Check if permission A subsumes permission B
 *
 * Subsumption rules:
 * 1. Same type required (Bash subsumes Bash, not Read)
 * 2. Identical scopes = not subsumption (exact match)
 * 3. Broader scope subsumes narrower scope:
 *    - Command: "git:*" subsumes "git log:*", "git worktree:*"
 *    - Path: "/Users/user/Code/**" subsumes "/Users/user/Code/project-a/**"
 *
 * @param broader - Permission that might subsume the other
 * @param narrower - Permission that might be subsumed
 * @returns true if broader subsumes narrower, false otherwise
 *
 * @example
 * ```typescript
 * subsumes(
 *   parsePermission("Bash(git:*)", "allow"),
 *   parsePermission("Bash(git log:*)", "allow")
 * )
 * // Returns: true
 *
 * subsumes(
 *   parsePermission("Read(file_path:/Users/user/Code/**)", "allow"),
 *   parsePermission("Read(file_path:/Users/user/Code/project-a/**)", "allow")
 * )
 * // Returns: true
 *
 * subsumes(
 *   parsePermission("Bash(git:*)", "allow"),
 *   parsePermission("Read(file_path:/Users/user/Code/**)", "allow")
 * )
 * // Returns: false (different types)
 * ```
 */
export function subsumes(broader: Permission, narrower: Permission): boolean {
  // 1. Type must match
  if (broader.type !== narrower.type) {
    return false;
  }

  // 2. Identical = not subsumption (this is just a duplicate)
  if (broader.scope === narrower.scope) {
    return false;
  }

  // 3. Parse scope patterns
  const broaderScope = parseScopePattern(broader.scope);
  const narrowerScope = parseScopePattern(narrower.scope);

  // 4. Handle command patterns (e.g., "git:*")
  if (broaderScope.type === "command" && narrowerScope.type === "command") {
    // Extract base command by removing :* suffix
    const broaderBase = broaderScope.pattern.replace(/:?\*+$/, "");
    const narrowerFull = narrowerScope.pattern.replace(/:?\*+$/, "");

    // Check if narrower starts with broader prefix
    // "git:*" subsumes "git log:*" if:
    // - narrowerFull starts with broaderBase
    // - narrowerFull is longer (more specific)
    if (narrowerFull.startsWith(broaderBase)) {
      // Additional specificity check: narrower must add more detail
      // e.g., "git" subsumes "git log", but not "git" subsumes "git"
      return narrowerFull.length > broaderBase.length;
    }
  }

  // 5. Handle path patterns (e.g., "/Users/user/Code/**")
  if (broaderScope.type === "path" && narrowerScope.type === "path") {
    // Normalize paths for comparison
    const broaderPath = normalizePath(broaderScope.pattern.replace(/\/?\*+$/, ""));
    const narrowerPath = normalizePath(narrowerScope.pattern.replace(/\/?\*+$/, ""));

    // Check if narrower is a sub-path of broader
    // "/Users/user/Code" subsumes "/Users/user/Code/project-a" if:
    // - narrowerPath starts with broaderPath + "/"
    return narrowerPath.startsWith(broaderPath + "/");
  }

  // 6. Mixed pattern types don't subsume each other
  return false;
}

/**
 * Find all subsumption relationships in a permission list
 *
 * Returns a map of broader permissions to the narrower permissions
 * they subsume. This allows identifying which permissions can be
 * removed from the list.
 *
 * @param permissions - Array of permissions to analyze
 * @returns Array of subsumption results
 *
 * @example
 * ```typescript
 * const permissions = [
 *   parsePermission("Bash(git:*)", "allow"),
 *   parsePermission("Bash(git log:*)", "allow"),
 *   parsePermission("Bash(git worktree:*)", "allow"),
 *   parsePermission("Bash(npm:*)", "allow"),
 * ];
 *
 * const results = detectSubsumptions(permissions);
 * // Returns: [
 * //   {
 * //     broader: { raw: "Bash(git:*)", ... },
 * //     narrower: [
 * //       { raw: "Bash(git log:*)", ... },
 * //       { raw: "Bash(git worktree:*)", ... }
 * //     ]
 * //   }
 * // ]
 * ```
 */
export function detectSubsumptions(permissions: Permission[]): SubsumptionResult[] {
  const results: SubsumptionResult[] = [];
  const processedBroader = new Set<string>();

  for (let i = 0; i < permissions.length; i++) {
    const broader = permissions[i];

    // Skip if already processed as a broader permission
    if (processedBroader.has(broader.raw)) {
      continue;
    }

    const narrowerPerms: Permission[] = [];

    // Check all other permissions to see if this one subsumes them
    for (let j = 0; j < permissions.length; j++) {
      if (i === j) continue; // Skip comparing with self

      const narrower = permissions[j];

      if (subsumes(broader, narrower)) {
        narrowerPerms.push(narrower);
      }
    }

    // If this permission subsumes others, record it
    if (narrowerPerms.length > 0) {
      results.push({
        broader,
        narrower: narrowerPerms,
      });
      processedBroader.add(broader.raw);
    }
  }

  return results;
}

/**
 * Remove subsumed permissions from a list, keeping only the broadest ones
 *
 * This is the main function for consolidating permissions.
 * It finds all subsumption relationships and removes narrower
 * permissions, leaving only the broadest ones.
 *
 * @param permissionStrings - Array of raw permission strings
 * @param category - Permission category (for parsing)
 * @returns Array of permission strings with subsumed ones removed
 *
 * @example
 * ```typescript
 * const permissions = [
 *   "Bash(git:*)",
 *   "Bash(git log:*)",
 *   "Bash(git worktree:*)",
 *   "Bash(npm:*)",
 * ];
 *
 * const result = removeSubsumed(permissions, "allow");
 * // Returns: ["Bash(git:*)", "Bash(npm:*)"]
 * ```
 */
export function removeSubsumed(
  permissionStrings: string[],
  category: PermissionCategory,
): string[] {
  // Parse all permission strings
  const permissions = permissionStrings
    .map((raw) => {
      try {
        return parsePermission(raw, category);
      } catch {
        // Keep malformed permissions as-is (don't filter them out)
        return null;
      }
    })
    .filter((p): p is Permission => p !== null);

  // Detect subsumptions
  const subsumptions = detectSubsumptions(permissions);

  // Build set of narrower permissions to remove
  const toRemove = new Set<string>();
  for (const result of subsumptions) {
    for (const narrower of result.narrower) {
      toRemove.add(narrower.raw);
    }
  }

  // Filter out subsumed permissions
  return permissionStrings.filter((perm) => !toRemove.has(perm));
}
