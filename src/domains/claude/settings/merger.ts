/**
 * Permission merging with subsumption and conflict resolution
 */
import { compareAsciiStrings } from "@/lib/state-store";
import { parsePermission } from "./parser";
import { removeSubsumed, subsumes } from "./subsumption";
import {
  type ConsolidationResult,
  PERMISSION_CATEGORY,
  type PermissionCategory,
  type Permissions,
  type PermissionsAdded,
} from "./types";

const PERMISSION_CATEGORIES: readonly PermissionCategory[] = [
  PERMISSION_CATEGORY.ALLOW,
  PERMISSION_CATEGORY.DENY,
  PERMISSION_CATEGORY.ASK,
];

// Combine global and local permissions per category, counting files that carried
// at least one permission against those that carried none.
function combinePermissions(
  global: Permissions,
  local: Permissions[],
): { combined: Permissions; filesProcessed: number; filesSkipped: number } {
  const combined: Permissions = {
    allow: [...(global.allow || [])],
    deny: [...(global.deny || [])],
    ask: [...(global.ask || [])],
  };

  let filesProcessed = 0;
  let filesSkipped = 0;

  for (const localPerms of local) {
    let hasPerms = false;
    for (const category of PERMISSION_CATEGORIES) {
      const values = localPerms[category];
      if (values && values.length > 0) {
        combined[category]?.push(...values);
        hasPerms = true;
      }
    }
    if (hasPerms) {
      filesProcessed++;
    } else {
      filesSkipped++;
    }
  }

  return { combined, filesProcessed, filesSkipped };
}

// Remove subsumed permissions per category, collecting every permission dropped.
function applySubsumption(
  combined: Permissions,
): { afterSubsumption: Permissions; allSubsumed: string[] } {
  const afterSubsumption: Permissions = {};
  const allSubsumed: string[] = [];

  for (const category of PERMISSION_CATEGORIES) {
    const values = combined[category];
    if (values && values.length > 0) {
      const before = new Set(values);
      const filtered = removeSubsumed(values, category);
      const after = new Set(filtered);
      for (const perm of before) {
        if (!after.has(perm)) {
          allSubsumed.push(perm);
        }
      }
      afterSubsumption[category] = filtered;
    } else {
      afterSubsumption[category] = values;
    }
  }

  return { afterSubsumption, allSubsumed };
}

// Deduplicate and sort each category's resolved permissions.
function dedupeAndSort(resolved: Permissions): Permissions {
  const merged: Permissions = {};
  for (const category of PERMISSION_CATEGORIES) {
    const values = resolved[category];
    if (values && values.length > 0) {
      merged[category] = Array.from(new Set(values)).sort(compareAsciiStrings);
    }
  }
  return merged;
}

// Compute the permissions present in the merged result but absent from the
// original global baseline.
function computeAdded(
  merged: Permissions,
  originalGlobal: Record<PermissionCategory, Set<string>>,
): PermissionsAdded {
  const added: PermissionsAdded = { allow: [], deny: [], ask: [] };
  for (const category of PERMISSION_CATEGORIES) {
    for (const perm of merged[category] || []) {
      if (!originalGlobal[category].has(perm)) {
        added[category].push(perm);
      }
    }
  }
  return added;
}

/**
 * Merge permissions from global settings and multiple local settings files
 *
 * Process:
 * 1. Combine all permissions by category (allow/deny/ask)
 * 2. Apply subsumption to remove narrower permissions
 * 3. Resolve conflicts (deny wins over allow)
 * 4. Deduplicate using Sets
 * 5. Sort alphabetically
 *
 * @param global - Global settings permissions (baseline)
 * @param local - Array of local settings permissions to merge in
 * @returns Merged permissions and consolidation statistics
 *
 * @example
 * ```typescript
 * const global = { allow: ["Bash(ls:*)"] };
 * const local = [
 *   { allow: ["Bash(git:*)", "Bash(git log:*)"] },
 *   { deny: ["Bash(rm:*)"] }
 * ];
 *
 * const { merged, result } = mergePermissions(global, local);
 * // merged.allow: ["Bash(git:*)", "Bash(ls:*)"]  // git log:* removed by subsumption
 * // merged.deny: ["Bash(rm:*)"]
 * // result.subsumed: ["Bash(git log:*)"]
 * ```
 */
export function mergePermissions(
  global: Permissions,
  local: Permissions[],
): { merged: Permissions; result: ConsolidationResult } {
  const originalGlobal: Record<PermissionCategory, Set<string>> = {
    allow: new Set(global.allow || []),
    deny: new Set(global.deny || []),
    ask: new Set(global.ask || []),
  };

  // Step 1: Combine all permissions by category
  const { combined, filesProcessed, filesSkipped } = combinePermissions(global, local);

  // Step 2: Apply subsumption to each category
  const { afterSubsumption, allSubsumed } = applySubsumption(combined);

  // Step 3: Resolve conflicts (deny wins over allow)
  const {
    resolved,
    conflictCount,
    subsumed: conflictSubsumed,
  } = resolveConflicts(afterSubsumption);

  // Combine subsumptions from step 2 and step 3
  const subsumed = [...allSubsumed, ...conflictSubsumed].sort(compareAsciiStrings);

  // Step 4: Deduplicate using Sets and sort
  const merged = dedupeAndSort(resolved);

  // Step 5: Compute what was added relative to the original global baseline
  const added = computeAdded(merged, originalGlobal);

  const result: ConsolidationResult = {
    filesScanned: local.length,
    filesProcessed,
    filesSkipped,
    added,
    subsumed,
    conflictsResolved: conflictCount,
  };

  return { merged, result };
}

/**
 * Resolve conflicts between allow and deny permissions
 *
 * Rules:
 * - If exact match in both allow and deny: keep in deny, remove from allow
 * - If deny has broader permission that subsumes allow: remove from allow
 *
 * This implements a security-first approach: deny always wins.
 *
 * @param permissions - Permissions with potential conflicts
 * @returns Resolved permissions with conflicts removed, count of conflicts, and list of subsumed permissions
 *
 * @example
 * ```typescript
 * const permissions = {
 *   allow: ["Bash(git log:*)", "Bash(npm:*)"],
 *   deny: ["Bash(git:*)"]
 * };
 *
 * const { resolved, conflictCount } = resolveConflicts(permissions);
 * // resolved.allow: ["Bash(npm:*)"]  // git log:* removed (subsumed by deny git:*)
 * // resolved.deny: ["Bash(git:*)"]
 * // conflictCount: 1
 * ```
 */
export function resolveConflicts(permissions: Permissions): {
  resolved: Permissions;
  conflictCount: number;
  subsumed: string[];
} {
  const allow = permissions.allow || [];
  const deny = permissions.deny || [];
  const ask = permissions.ask || [];

  const denySet = new Set(deny);
  const subsumed: string[] = [];
  let conflictCount = 0;

  // Check each allow permission against deny permissions
  const allowToRemove = new Set<string>();

  for (const allowPerm of allow) {
    // Exact match: move to deny
    if (denySet.has(allowPerm)) {
      allowToRemove.add(allowPerm);
      conflictCount++;
      continue;
    }

    // Check if any deny permission subsumes this allow permission
    for (const denyPerm of deny) {
      try {
        const allowParsed = parsePermission(allowPerm, PERMISSION_CATEGORY.ALLOW);
        const denyParsed = parsePermission(denyPerm, PERMISSION_CATEGORY.DENY);

        if (subsumes(denyParsed, allowParsed)) {
          // Deny subsumes allow - remove from allow
          allowToRemove.add(allowPerm);
          subsumed.push(allowPerm);
          conflictCount++;
          break;
        }
      } catch {
        // Skip malformed permissions
        continue;
      }
    }
  }

  // Build resolved permissions
  const resolved: Permissions = {
    allow: allow.filter((p) => !allowToRemove.has(p)),
    deny,
    ask,
  };

  return { resolved, conflictCount, subsumed };
}
