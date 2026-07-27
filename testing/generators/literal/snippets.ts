const SOURCE_BINDING_NAME = "V";
const TEST_VARIABLE_NAME = "v";

export function buildStringDeclaration(value: string): string {
  return "export const " + SOURCE_BINDING_NAME + " = " + JSON.stringify(value) + ";\n";
}

export function buildNumericDeclaration(numStr: string): string {
  return "export const " + SOURCE_BINDING_NAME + " = " + numStr + ";\n";
}

export function buildTemplateDeclaration(value: string): string {
  return "export const " + SOURCE_BINDING_NAME + " = `" + value + "`;\n";
}

export function buildStringAssertion(value: string): string {
  return "expect(" + TEST_VARIABLE_NAME + ").toBe(" + JSON.stringify(value) + ");\n";
}

export function buildNumericAssertion(numStr: string): string {
  return "expect(" + TEST_VARIABLE_NAME + ").toBe(" + numStr + ");\n";
}
