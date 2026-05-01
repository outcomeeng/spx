// Intentional type error for testing validation
export function testFunction(): void {
  const numberVar: number = "this is a string not a number"; // Type error
  console.log(numberVar);
}
