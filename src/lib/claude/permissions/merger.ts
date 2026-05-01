/**
 * Permission merging with subsumption and conflict resolution
 */
import { parsePermission } from "./parser";
import { removeSubsumed, subsumes } from "./subsumption";
import type { ConsolidationResult, Permissions, PermissionsAdded } from "./types";

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
  // Track original global permissions for computing added
  const originalGlobal = {
    allow: new Set(global.allow || []),
    deny: new Set(global.deny || []),
    ask: new Set(global.ask || []),
  };

  // Step 1: Combine all permissions by category
  const combined: Permissions = {
    allow: [...(global.allow || [])],
    deny: [...(global.deny || [])],
    ask: [...(global.ask || [])],
  };

  let filesProcessed = 0;
  let filesSkipped = 0;

  for (const localPerms of local) {
    let hasPerms = false;

    if (localPerms.allow && localPerms.allow.length > 0) {
      combined.allow?.push(...localPerms.allow);
      hasPerms = true;
    }
    if (localPerms.deny && localPerms.deny.length > 0) {
      combined.deny?.push(...localPerms.deny);
      hasPerms = true;
    }
    if (localPerms.ask && localPerms.ask.length > 0) {
      combined.ask?.push(...localPerms.ask);
      hasPerms = true;
    }

    if (hasPerms) {
      filesProcessed++;
    } else {
      filesSkipped++;
    }
  }

  // Step 2: Apply subsumption to each category
  const allSubsumed: string[] = [];

  const afterSubsumption: Permissions = {};

  if (combined.allow && combined.allow.length > 0) {
    const before = new Set(combined.allow);
    combined.allow = removeSubsumed(combined.allow, "allow");
    const after = new Set(combined.allow);

    // Track what was removed
    for (const perm of before) {
      if (!after.has(perm)) {
        allSubsumed.push(perm);
      }
    }
  }

  if (combined.deny && combined.deny.length > 0) {
    const before = new Set(combined.deny);
    combined.deny = removeSubsumed(combined.deny, "deny");
    const after = new Set(combined.deny);

    // Track what was removed
    for (const perm of before) {
      if (!after.has(perm)) {
        allSubsumed.push(perm);
      }
    }
  }

  if (combined.ask && combined.ask.length > 0) {
    const before = new Set(combined.ask);
    combined.ask = removeSubsumed(combined.ask, "ask");
    const after = new Set(combined.ask);

    // Track what was removed
    for (const perm of before) {
      if (!after.has(perm)) {
        allSubsumed.push(perm);
      }
    }
  }

  afterSubsumption.allow = combined.allow;
  afterSubsumption.deny = combined.deny;
  afterSubsumption.ask = combined.ask;

  // Step 3: Resolve conflicts (deny wins over allow)
  const {
    resolved,
    conflictCount,
    subsumed: conflictSubsumed,
  } = resolveConflicts(afterSubsumption);

  // Combine subsumptions from step 2 and step 3
  const subsumed = [...allSubsumed, ...conflictSubsumed];

  // Step 4: Deduplicate using Sets and sort
  const merged: Permissions = {};

  if (resolved.allow && resolved.allow.length > 0) {
    merged.allow = Array.from(new Set(resolved.allow)).sort();
  }

  if (resolved.deny && resolved.deny.length > 0) {
    merged.deny = Array.from(new Set(resolved.deny)).sort();
  }

  if (resolved.ask && resolved.ask.length > 0) {
    merged.ask = Array.from(new Set(resolved.ask)).sort();
  }

  // Step 5: Compute what was added
  const added: PermissionsAdded = {
    allow: [],
    deny: [],
    ask: [],
  };

  for (const perm of merged.allow || []) {
    if (!originalGlobal.allow.has(perm)) {
      added.allow.push(perm);
    }
  }

  for (const perm of merged.deny || []) {
    if (!originalGlobal.deny.has(perm)) {
      added.deny.push(perm);
    }
  }

  for (const perm of merged.ask || []) {
    if (!originalGlobal.ask.has(perm)) {
      added.ask.push(perm);
    }
  }

  // Build result
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
        const allowParsed = parsePermission(allowPerm, "allow");
        const denyParsed = parsePermission(denyPerm, "deny");

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
