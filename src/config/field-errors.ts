/** Diagnostic for a field a config section does not recognize. */
export function formatUnrecognizedConfigFieldError(path: string, field: string): string {
  return `${path}.${field} is not a recognized config field`;
}
