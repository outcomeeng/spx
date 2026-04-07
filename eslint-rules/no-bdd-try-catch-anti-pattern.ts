/**
 * ESLint Rule: No BDD Try-Catch Anti-Pattern
 *
 * Prevents test assertions hidden inside try-catch blocks that swallow errors.
 * When expect() calls are inside a try block and the catch doesn't re-throw,
 * test failures are silently suppressed — the test passes when it should fail.
 *
 * Catches anti-patterns like:
 * - try { expect(x).toBe(y) } catch {} — empty catch swallows assertion failure
 * - try { await fn(); expect() } catch (e) { if (e instanceof X) ... } — conditional handling
 * - try { expect() } catch { console.log("failed") } — logged but not thrown
 */

import type { Rule } from "eslint";
import type { Node as ESTreeNode } from "estree";

function isExpectCall(node: ESTreeNode): boolean {
  if (node.type !== "CallExpression") return false;
  if (node.callee.type === "Identifier" && node.callee.name === "expect") {
    return true;
  }
  if (
    node.callee.type === "MemberExpression"
    && node.callee.object.type === "CallExpression"
    && node.callee.object.callee.type === "Identifier"
    && node.callee.object.callee.name === "expect"
  ) {
    return true;
  }
  return false;
}

function containsExpectCalls(node: ESTreeNode): boolean {
  if (isExpectCall(node)) return true;
  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const child = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (typeof item === "object" && item !== null && "type" in item && containsExpectCalls(item as ESTreeNode)) {
          return true;
        }
      }
    } else if (
      typeof child === "object" && child !== null && "type" in child
      && containsExpectCalls(child as ESTreeNode)
    ) {
      return true;
    }
  }
  return false;
}

function catchClauseReThrows(catchClause: ESTreeNode & { type: "CatchClause" }): boolean {
  for (const statement of catchClause.body.body) {
    if (statement.type === "ThrowStatement") return true;
  }
  return false;
}

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Prevent test assertions hidden in try-catch blocks that swallow errors",
    },
    messages: {
      hiddenAssertions:
        "Test assertions inside try-catch with no re-throw. The catch block silently suppresses assertion failures — the test passes when it should fail. Remove the try-catch, or re-throw the error.",
      emptySwallowing:
        "Empty catch block swallows test assertion failures. Remove the try-catch, or re-throw the error.",
    },
  },

  create(context) {
    return {
      TryStatement(node) {
        const catchClause = node.handler;
        if (!catchClause) return;

        if (!containsExpectCalls(node.block)) return;

        if (catchClause.body.body.length === 0) {
          context.report({ node, messageId: "emptySwallowing" });
          return;
        }

        if (!catchClauseReThrows(catchClause)) {
          context.report({ node, messageId: "hiddenAssertions" });
        }
      },
    };
  },
};

export default rule;
