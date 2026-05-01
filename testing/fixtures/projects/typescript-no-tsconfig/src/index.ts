// TypeScript source file present but no tsconfig.json in project root.
// This fixture tests that tsc is NOT invoked when tsconfig.json is absent,
// even when .ts files exist.
export const greeting: string = "hello";
