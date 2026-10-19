import {
  selectSpecTreeGrammar,
  SPEC_TREE_METHODOLOGY_LINE,
  type SpecTreeMethodologyDeclaration,
  type SpecTreeRecognitionOptions,
} from "@/lib/spec-tree";

/** The recognition options of the grammar a methodology declaration selects. */
export function recognitionOptionsForDeclaration(
  declaration: SpecTreeMethodologyDeclaration,
): SpecTreeRecognitionOptions {
  const selection = selectSpecTreeGrammar(declaration);
  return { schemaVersions: selection.known, selectedVersions: selection.selected };
}

/** The recognition options of the grammar a declaration on the given line selects. */
export function recognitionOptionsForLine(line: string): SpecTreeRecognitionOptions {
  return recognitionOptionsForDeclaration({ version: line });
}

/** The recognition options of a 4.0 declaration that names a 3.x migration source: both grammars are selected. */
export function migratingRecognitionOptions(): SpecTreeRecognitionOptions {
  return recognitionOptionsForDeclaration({
    version: SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO,
    migratingFrom: SPEC_TREE_METHODOLOGY_LINE.THREE_TWO,
  });
}
