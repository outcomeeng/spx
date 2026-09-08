/**
 * The positional product-path operand vocabulary the verification surfaces share, per
 * `spx/29-verification-path-scope.pdr.md`: the recursive modifier that widens a node-path operand
 * to its subtree, and the path-scope flags no surface introduces because positional operands
 * already express that scope. `spx test` and `spx verification <type> run` register the modifier
 * from this one declaration, so an operand means the same on both surfaces.
 */
export const PATH_OPERAND_CLI_SURFACE = {
  recursiveShortFlag: "-r",
  recursiveLongFlag: "--recursive",
  recursiveDescription: "Extend a node-path operand to its descendant nodes' tests",
  forbiddenScopeFlags: ["--files", "--tests", "--nodes"],
} as const;

const FLAG_ALTERNATIVE_SEPARATOR = ", ";

/** The Commander flags expression registering the recursive modifier: its short and long forms. */
export function recursiveOptionFlags(): string {
  return `${PATH_OPERAND_CLI_SURFACE.recursiveShortFlag}${FLAG_ALTERNATIVE_SEPARATOR}${PATH_OPERAND_CLI_SURFACE.recursiveLongFlag}`;
}
