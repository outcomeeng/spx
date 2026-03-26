/**
 * ESLint Rule: No BDD Try-Catch Anti-Pattern
 *
 * Prevents BDD violations where main test assertions are hidden inside
 * try-catch blocks that catch "not implemented" errors, which hides
 * test failures and violates the RED-GREEN-REFACTOR cycle.
 *
 * Catches anti-patterns like:
 * - try { await withTestEnv(); expect() } catch (TestLevelNotImplementedError) {} ❌
 * - Conditional assertions after catching implementation errors ❌
 * - Generic error swallowing in test assertions ❌
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Rule } from "eslint";

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Prevent BDD violations where test assertions are hidden in try-catch blocks",
      category: "Testing",
      recommended: true,
    },
    fixable: undefined,
    schema: [],
    messages: {
      bddViolationHiddenAssertions:
        "BDD violation: Don't hide test assertions in try-catch blocks. Let tests fail when functionality isn't implemented yet.",
      bddViolationConditionalAssertions:
        "BDD violation: Conditional assertions after catch blocks hide test failures. Make assertions unconditional.",
      bddViolationGenericSwallowing:
        "BDD violation: Generic error swallowing in tests prevents proper failure reporting. Let tests fail loudly.",
      suggestProperBdd: "Consider: Remove try-catch and let test fail, or use expect().rejects for error testing.",
    },
  },
  create(context: Rule.RuleContext) {
    /**
     * Check if we're in a test file
     */
    function isTestFile() {
      const filename = context.getFilename?.() || context.filename;
      return (
        filename.includes(".test.")
        || filename.includes(".spec.")
        || filename.includes("/tests/")
        || filename.includes("/__tests__/")
      );
    }
    /**
     * Check if a node represents an expect() assertion call
     */
    function isExpectCall(node: any): boolean {
      if (node.type !== "CallExpression") return false;
      // Direct expect() call
      if (node.callee?.name === "expect") {
        return true;
      }
      // Chained expect().method() calls
      if (
        node.callee?.type === "MemberExpression"
        && node.callee.object?.type === "CallExpression"
        && node.callee.object.callee?.name === "expect"
      ) {
        return true;
      }
      return false;
    }
    /**
     * Check if a block statement contains expect() calls
     */
    function containsExpectCalls(block: any): boolean {
      if (!block || !block.body) return false;
      function checkNode(node: any): boolean {
        if (!node) return false;
        if (isExpectCall(node)) return true;
        // Recursively check child nodes
        for (const key in node) {
          if (key === "parent") continue; // Avoid circular references
          const child = node[key];
          if (Array.isArray(child)) {
            for (const item of child) {
              if (typeof item === "object" && item !== null && checkNode(item)) {
                return true;
              }
            }
          } else if (typeof child === "object" && child !== null && checkNode(child)) {
            return true;
          }
        }
        return false;
      }
      for (const statement of block.body) {
        if (checkNode(statement)) return true;
      }
      return false;
    }
    /**
     * Check if catch clause handles "not implemented" style errors
     */
    function catchesNotImplementedError(catchClause: any): boolean {
      if (!catchClause || !catchClause.body) return false;
      // Look for instanceof checks for common "not implemented" error types
      const notImplementedErrorPatterns = [
        "TestLevelNotImplementedError",
        "NotImplementedError",
        "FeatureNotImplementedError",
        "UnimplementedError",
      ];
      function checkForErrorPattern(node: any): boolean {
        if (!node) return false;
        // Check for "error instanceof SomeError" pattern
        if (
          node.type === "BinaryExpression"
          && node.operator === "instanceof"
          && node.right?.name
        ) {
          return notImplementedErrorPatterns.includes(node.right.name);
        }
        // Check for error.constructor === SomeError
        if (
          node.type === "BinaryExpression"
          && node.operator === "==="
          && node.left?.type === "MemberExpression"
          && node.left.property?.name === "constructor"
        ) {
          return notImplementedErrorPatterns.includes(node.right?.name);
        }
        // Recursively check child nodes
        for (const key in node) {
          if (key === "parent") continue;
          const child = node[key];
          if (Array.isArray(child)) {
            for (const item of child) {
              if (typeof item === "object" && item !== null && checkForErrorPattern(item)) {
                return true;
              }
            }
          } else if (typeof child === "object" && child !== null && checkForErrorPattern(child)) {
            return true;
          }
        }
        return false;
      }
      return checkForErrorPattern(catchClause.body);
    }
    /**
     * Check if catch clause re-throws the error (making it legitimate)
     */
    function catchClauseReThrows(catchClause: any): boolean {
      if (!catchClause || !catchClause.body || !catchClause.body.body) return false;
      for (const statement of catchClause.body.body) {
        if (statement.type === "ThrowStatement") {
          return true;
        }
      }
      return false;
    }
    /**
     * Check for conditional assertions that depend on caught errors
     */
    function hasConditionalAssertionsAfterTryCatch(node: any): boolean {
      // Look for if statements after try-catch that might contain expect calls
      const parent = node.parent;
      if (parent?.type === "BlockStatement") {
        const statements = parent.body;
        const tryIndex = statements.indexOf(node);
        // Check statements after the try-catch
        for (let i = tryIndex + 1; i < statements.length; i++) {
          const statement = statements[i];
          if (statement.type === "IfStatement" && containsExpectCalls(statement.consequent)) {
            return true;
          }
        }
      }
      return false;
    }
    if (!isTestFile()) {
      return {}; // Don't apply rule to non-test files
    }
    return {
      TryStatement(node: any) {
        const tryBlock = node.block;
        const catchClause = node.handler;
        // Check if try block contains expect() calls
        const hasExpectInTry = containsExpectCalls(tryBlock);
        if (hasExpectInTry && catchClause) {
          // Check if catch handles "not implemented" errors
          const catchesNotImplemented = catchesNotImplementedError(catchClause);
          const reThrows = catchClauseReThrows(catchClause);
          if (catchesNotImplemented && !reThrows) {
            context.report({
              node: node,
              messageId: "bddViolationHiddenAssertions",
            });
          } else if (catchClause && !reThrows) {
            // Generic error swallowing with assertions in try
            context.report({
              node: node,
              messageId: "bddViolationGenericSwallowing",
            });
          }
        }
        // Check for conditional assertions after try-catch
        if (catchClause && hasConditionalAssertionsAfterTryCatch(node)) {
          context.report({
            node: node,
            messageId: "bddViolationConditionalAssertions",
          });
        }
      },
      // Also catch bare catch blocks without proper error handling
      CatchClause(node: any) {
        const catchBlock = node.body;
        // If catch block is empty or only has comments, flag it
        if (catchBlock && catchBlock.body && catchBlock.body.length === 0) {
          // Check if the try block had assertions
          const tryStatement = node.parent;
          if (tryStatement && containsExpectCalls(tryStatement.block)) {
            context.report({
              node: node,
              messageId: "bddViolationGenericSwallowing",
            });
          }
        }
      },
    };
  },
};
export default rule;
