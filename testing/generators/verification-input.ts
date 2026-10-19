/**
 * Generators for the verification-input domain: byte sequences, line-ending variants of one text,
 * product-relative file paths, and file scenarios whose expected digests derive from node:crypto.
 */
import * as fc from "fast-check";
import { createHash } from "node:crypto";

import { OPERAND_SPELLING, type OperandSpelling } from "@/lib/verification-input";
import { sampleGeneratedValue } from "@testing/generators/sample";

const SHA256_ALGORITHM = "sha256";
const HEX_ENCODING = "hex";
const LF = "\n";
const CRLF = "\r\n";
const CR = "\r";
const LINE_ENDINGS = [LF, CRLF, CR] as const;
const MAX_LINES = 8;
const MAX_BYTES = 256;
const MAX_SEGMENTS = 3;

export interface LineEndingVariants {
  readonly lines: readonly string[];
  readonly first: string;
  readonly second: string;
  readonly canonical: string;
}

export interface VerificationInputFileScenario {
  readonly path: string;
  readonly otherPath: string;
  readonly bytes: Uint8Array;
}

export interface TextFileScenario {
  readonly path: string;
  readonly variants: LineEndingVariants;
}

/** Independent SHA-256 reference: the runtime's own implementation, never the production digest path. */
export function referenceSha256(content: Uint8Array | string): string {
  return createHash(SHA256_ALGORITHM).update(content).digest(HEX_ENCODING);
}

function arbitrarySegment(): fc.Arbitrary<string> {
  return fc.stringMatching(/^[a-z][a-z0-9]{2,8}$/);
}

/** A product-relative path of one to three directories and a file with an extension. */
export function arbitraryProductRelativePath(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.array(arbitrarySegment(), { minLength: 0, maxLength: MAX_SEGMENTS }),
      arbitrarySegment(),
      fc.stringMatching(/^[a-z]{2,4}$/),
    )
    .map(([directories, name, extension]) => [...directories, `${name}.${extension}`].join("/"));
}

/** Arbitrary byte sequences, valid UTF-8 or not. */
export function arbitraryByteSequence(): fc.Arbitrary<Uint8Array> {
  return fc.uint8Array({ minLength: 0, maxLength: MAX_BYTES });
}

/** Bytes that strict UTF-8 decoding rejects. */
export function arbitraryInvalidUtf8(): fc.Arbitrary<Uint8Array> {
  return fc
    .tuple(fc.uint8Array({ minLength: 0, maxLength: 8 }), fc.constantFrom(0xff, 0xfe, 0xc0, 0xf8))
    .map(([prefix, invalid]) => Uint8Array.from([...prefix.map((byte) => byte & 0x7f), invalid]));
}

/** One text expressed under two independently drawn line-ending styles per line. */
export function arbitraryLineEndingVariants(): fc.Arbitrary<LineEndingVariants> {
  return fc
    .array(fc.string({ unit: "grapheme-ascii", maxLength: 12 }).filter((line) => !/[\r\n]/.test(line)), {
      minLength: 1,
      maxLength: MAX_LINES,
    })
    .chain((lines) =>
      fc
        .tuple(
          fc.array(fc.constantFrom(...LINE_ENDINGS), { minLength: lines.length, maxLength: lines.length }),
          fc.array(fc.constantFrom(...LINE_ENDINGS), { minLength: lines.length, maxLength: lines.length }),
        )
        .map(([firstEndings, secondEndings]) => ({
          lines,
          first: lines.map((line, index) => line + firstEndings[index]).join(""),
          second: lines.map((line, index) => line + secondEndings[index]).join(""),
          canonical: lines.map((line) => line + LF).join(""),
        }))
    );
}

export function arbitraryVerificationInputFileScenario(): fc.Arbitrary<VerificationInputFileScenario> {
  return fc
    .tuple(arbitraryProductRelativePath(), arbitraryProductRelativePath(), arbitraryByteSequence())
    .filter(([path, otherPath]) => path !== otherPath)
    .map(([path, otherPath, bytes]) => ({ path, otherPath, bytes }));
}

export function arbitraryTextFileScenario(): fc.Arbitrary<TextFileScenario> {
  return fc
    .tuple(arbitraryProductRelativePath(), arbitraryLineEndingVariants())
    .map(([path, variants]) => ({ path, variants }));
}

export const VERIFICATION_INPUT_TEST_GENERATOR = {
  byteSequence: arbitraryByteSequence,
  invalidUtf8: arbitraryInvalidUtf8,
  lineEndingVariants: arbitraryLineEndingVariants,
  fileScenario: arbitraryVerificationInputFileScenario,
  textFileScenario: arbitraryTextFileScenario,
  productRelativePath: arbitraryProductRelativePath,
} as const;

export function sampleVerificationInputValue<T>(arbitrary: fc.Arbitrary<T>): T {
  return sampleGeneratedValue(arbitrary);
}

export interface OperandForSpelling {
  readonly operand: string;
  readonly invocationDir: string;
}

/**
 * Construction law from the governing spec: an absolute operand is the file's absolute path; a
 * relative operand is the path relative to the invocation directory, relative to the worktree
 * root, or a complete-path-component suffix of the root-relative path.
 */
export function operandForSpelling(
  spelling: OperandSpelling,
  root: string,
  relativePath: string,
): OperandForSpelling {
  const components = relativePath.split("/");
  const directory = components.slice(0, -1).join("/");
  const name = components[components.length - 1] ?? relativePath;
  switch (spelling) {
    case OPERAND_SPELLING.ABSOLUTE:
      return { operand: `${root}/${relativePath}`, invocationDir: root };
    case OPERAND_SPELLING.FROM_INVOCATION_DIRECTORY:
      return { operand: name, invocationDir: directory === "" ? root : `${root}/${directory}` };
    case OPERAND_SPELLING.FROM_WORKTREE_ROOT:
      return { operand: relativePath, invocationDir: root };
    case OPERAND_SPELLING.PATH_SUFFIX:
      return { operand: components.slice(-2).join("/"), invocationDir: root };
  }
}
