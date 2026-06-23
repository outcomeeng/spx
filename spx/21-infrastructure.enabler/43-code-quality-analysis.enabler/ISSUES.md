# Issues

## `import/no-duplicates` resolves by specifier string, not module path

`eslint.config.ts` registers `eslint-plugin-import` without an `import/resolver`
setting, so the error-tier `import/no-duplicates` rule detects duplicate imports
by comparing module-specifier strings rather than resolving specifiers to a
shared module path. A TypeScript-aware resolver is not configured: the resolver
dependency is not installed, and the codebase imports through `@/` aliases
consistently, so the realistic duplicate pattern is identical specifier strings,
which string comparison already catches.

Revisit only if alias-vs-relative duplicate detection becomes necessary — two
different specifiers that resolve to the same module. That would require
installing and configuring a TypeScript-aware `import/resolver` and confirming it
does not regress the lint run; the previously present resolver block was removed
because its dependency was absent and it broke the run.
