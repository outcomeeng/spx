const TYPESCRIPT_EXTENSIONS: ReadonlySet<string> = new Set([".ts", ".tsx"]);
const DECLARATION_SUFFIX = ".d.ts";

export function isTypescriptSource(path: string): boolean {
  if (path.endsWith(DECLARATION_SUFFIX)) return false;
  const ext = extensionOf(path);
  return TYPESCRIPT_EXTENSIONS.has(ext);
}

function extensionOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx);
}

export function isTestFile(relPath: string): boolean {
  return /\.test\.tsx?$/.test(relPath);
}
