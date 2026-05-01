// Intentional ESLint violations for testing validation
export function testFunction(): void {
  var oldStyleVar = "using var instead of const"; // no-var violation
  const unusedVariable = "this is never used"; // no-unused-vars violation
  console.log(oldStyleVar);
}
