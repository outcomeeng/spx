import { projectSpecContextDocument, renderSpecContextEntries, SPEC_CONTEXT_MODE, SPEC_CONTEXT_DIGEST_SOURCE } from "@/lib/spec-tree";
const src = "---\nmalleability: spec\n---\n\n# Title\n\nPROVIDES x\nSO THAT y\n\n## Assertions\n";
const full = projectSpecContextDocument({ path: "spx/a.enabler/a.md", mode: SPEC_CONTEXT_MODE.FULL, roles: [], outputNode: true, digest: { source: SPEC_CONTEXT_DIGEST_SOURCE.OPENING, kind: "enabler", keyword: "PROVIDES" } }, src);
const dig = projectSpecContextDocument({ path: "spx/a.enabler/a.md", mode: SPEC_CONTEXT_MODE.DIGEST, roles: [], outputNode: true, digest: { source: SPEC_CONTEXT_DIGEST_SOURCE.OPENING, kind: "enabler", keyword: "PROVIDES" } }, src);
const dec = projectSpecContextDocument({ path: "spx/1-x.adr.md", mode: SPEC_CONTEXT_MODE.DIGEST, roles: [], digest: { source: SPEC_CONTEXT_DIGEST_SOURCE.DECISION_STATEMENT } }, "# X\n\nThe decision statement.\n\n## Rationale\n\nWhy.\n");
console.log(JSON.stringify(renderSpecContextEntries([full, dig, dec])));
for (const [sel, s] of [[{ source: SPEC_CONTEXT_DIGEST_SOURCE.DECISION_STATEMENT }, "# X\n\n## Rationale\n"], [{ source: SPEC_CONTEXT_DIGEST_SOURCE.OPENING, kind: "k", keyword: undefined }, "# X\n"], [undefined, "# P\n"]] as const) {
  try { projectSpecContextDocument({ path: "p", mode: SPEC_CONTEXT_MODE.DIGEST, roles: [], digest: sel as never }, s); console.log("NO THROW"); } catch (e) { console.log(String(e)); }
}
