/**
 * Tree validation functions to ensure structural integrity
 *
 * Part of Feature 54 (Tree Building), Story 54 (Tree Validation)
 */
import type { TreeNode, WorkItemTree } from "./types.js";

/**
 * Custom error for tree validation failures
 */
export class TreeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TreeValidationError";
  }
}

/**
 * Validates tree structure constraints
 *
 * Ensures all tree invariants hold:
 * - Stories only appear under features
 * - Features only appear under capabilities
 * - No cycles in the tree
 * - No duplicate BSP numbers at the same level
 *
 * @param tree - Tree to validate
 * @throws {TreeValidationError} If validation fails
 *
 * @example
 * ```typescript
 * const tree = buildTree(workItems);
 * validateTree(tree); // Throws if invalid
 * ```
 */
export function validateTree(tree: WorkItemTree): void {
  // Validate each capability and its children
  for (const capability of tree.nodes) {
    validateNode(capability, "root");
  }

  // Check for duplicate BSP numbers at root level (capabilities)
  checkDuplicateBSP(tree.nodes, "capability");
}

/**
 * Validates a single node and its children recursively
 *
 * @param node - Node to validate
 * @param parentKind - Kind of parent node ("root", "capability", "feature")
 * @param visited - Set of visited paths for cycle detection
 * @throws {TreeValidationError} If validation fails
 */
function validateNode(
  node: TreeNode,
  parentKind: "root" | "capability" | "feature" | "story",
  visited: Set<string> = new Set(),
): void {
  // Check for cycles
  if (visited.has(node.path)) {
    throw new TreeValidationError(
      `Cycle detected: node at ${node.path} appears multiple times in tree`,
    );
  }
  visited.add(node.path);

  // Validate hierarchy constraints
  validateHierarchy(node, parentKind);

  // Check for duplicate BSP numbers among children
  if (node.children.length > 0) {
    checkDuplicateBSP(node.children, node.children[0].kind);

    // Recursively validate children
    for (const child of node.children) {
      validateNode(child, node.kind, new Set(visited));
    }
  }
}

/**
 * Validates that node kind is appropriate for its parent
 *
 * Hierarchy rules:
 * - Capabilities can only be at root
 * - Features can only be under capabilities
 * - Stories can only be under features
 *
 * @param node - Node to validate
 * @param parentKind - Kind of parent node
 * @throws {TreeValidationError} If hierarchy is invalid
 */
function validateHierarchy(
  node: TreeNode,
  parentKind: "root" | "capability" | "feature" | "story",
): void {
  switch (node.kind) {
    case "capability":
      if (parentKind !== "root") {
        throw new TreeValidationError(
          `Hierarchy error: capability "${node.slug}" must be at root level, found under ${parentKind}`,
        );
      }
      // Capabilities should only have features as children
      for (const child of node.children) {
        if (child.kind !== "feature") {
          throw new TreeValidationError(
            `Hierarchy error: capability "${node.slug}" has ${child.kind} child "${child.slug}", but can only contain features`,
          );
        }
      }
      break;

    case "feature":
      if (parentKind !== "capability") {
        throw new TreeValidationError(
          `Hierarchy error: feature "${node.slug}" must be under capability, found under ${parentKind}`,
        );
      }
      // Features should only have stories as children
      for (const child of node.children) {
        if (child.kind !== "story") {
          throw new TreeValidationError(
            `Hierarchy error: feature "${node.slug}" has ${child.kind} child "${child.slug}", but can only contain stories`,
          );
        }
      }
      break;

    case "story":
      if (parentKind !== "feature") {
        throw new TreeValidationError(
          `Hierarchy error: story "${node.slug}" must be under feature, found under ${parentKind}`,
        );
      }
      // Stories should have no children
      if (node.children.length > 0) {
        throw new TreeValidationError(
          `Hierarchy error: story "${node.slug}" has children, but stories must be leaf nodes`,
        );
      }
      break;
  }
}

/**
 * Checks for duplicate BSP numbers at the same level
 *
 * @param nodes - Nodes at the same level
 * @param kind - Kind of nodes being checked
 * @throws {TreeValidationError} If duplicates found
 */
function checkDuplicateBSP(nodes: TreeNode[], kind: string): void {
  const numbers = nodes.map((node) => node.number);
  const seen = new Set<number>();

  for (const num of numbers) {
    if (seen.has(num)) {
      throw new TreeValidationError(
        `Duplicate BSP number detected: multiple ${kind}s have number ${num} at the same level`,
      );
    }
    seen.add(num);
  }
}
