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
const LINE_TERMINATOR = /[\r\n]/;
const MAX_LINES = 8;
const MAX_LINE_LENGTH = 12;
const MAX_BYTES = 256;
const MAX_SEGMENTS = 3;
const BYTE_ORDER_MARK_BYTES = [0xef, 0xbb, 0xbf] as const;
const BYTE_ORDER_MARK_CHARACTER = "﻿";
const TEXT_FILE_EXTENSION = "txt";

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
  readonly otherPath: string;
  readonly variants: LineEndingVariants;
}

export interface ByteOrderMarkScenario {
  readonly path: string;
  /** The byte-order mark followed by the UTF-8 encoding of the first line-ending variant. */
  readonly bytes: Uint8Array;
  /** The text a digest that keeps the byte-order mark covers, in universal-newline form. */
  readonly canonicalTextWithMark: string;
}

export interface RejectionScenario {
  readonly path: string;
  readonly name: string;
  readonly firstDirectory: string;
  readonly secondDirectory: string;
}

/** Independent SHA-256 reference: the runtime's own implementation, never the production digest path. */
export function referenceSha256(content: Uint8Array | string): string {
  return createHash(SHA256_ALGORITHM).update(content).digest(HEX_ENCODING);
}

function arbitrarySegment(): fc.Arbitrary<string> {
  return fc.stringMatching(/^[a-z][a-z0-9]{2,8}$/);
}

function arbitraryProductRelativePathWithin(minDirectories: number): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.array(arbitrarySegment(), { minLength: minDirectories, maxLength: MAX_SEGMENTS }),
      arbitrarySegment(),
      fc.stringMatching(/^[a-z]{2,4}$/),
    )
    .map(([directories, name, extension]) => [...directories, `${name}.${extension}`].join("/"));
}

/** A product-relative path of up to three directories and a file with an extension. */
export function arbitraryProductRelativePath(): fc.Arbitrary<string> {
  return arbitraryProductRelativePathWithin(0);
}

/** A product-relative path with at least one directory, so its relative spellings differ from one another. */
export function arbitraryNestedProductRelativePath(): fc.Arbitrary<string> {
  return arbitraryProductRelativePathWithin(1);
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

/** A text line: any valid Unicode text, possibly empty, holding no line terminator. */
function arbitraryLine(): fc.Arbitrary<string> {
  return fc
    .string({ unit: "grapheme", minLength: 0, maxLength: MAX_LINE_LENGTH })
    .filter((line) => !LINE_TERMINATOR.test(line));
}

/**
 * Line endings as written, resolved right to left: a lone CR directly before an empty line whose own
 * ending begins with LF would fuse with it into one CRLF, so that CR is written as LF instead.
 */
function resolveEndings(lines: readonly string[], endings: readonly string[]): readonly string[] {
  return endings.reduceRight<readonly string[]>((resolved, ending, index) => {
    const fuses = ending === CR && lines[index + 1] === "" && (resolved.at(0)?.startsWith(LF) ?? false);
    return [fuses ? LF : ending, ...resolved];
  }, []);
}

/**
 * One text expressed under two independently drawn line-ending styles per line: any valid Unicode
 * text, empty lines included, with or without a terminated final line.
 */
export function arbitraryLineEndingVariants(): fc.Arbitrary<LineEndingVariants> {
  return fc
    .tuple(fc.array(arbitraryLine(), { minLength: 1, maxLength: MAX_LINES }), fc.boolean())
    .chain(([lines, terminated]) => {
      const endings = fc
        .array(fc.constantFrom(...LINE_ENDINGS), { minLength: lines.length, maxLength: lines.length })
        .map((drawn) => (terminated ? drawn : [...drawn.slice(0, -1), ""]));
      return fc.tuple(endings, endings).map(([firstDrawn, secondDrawn]) => {
        const first = resolveEndings(lines, firstDrawn);
        const second = resolveEndings(lines, secondDrawn);
        return {
          lines,
          first: lines.map((line, index) => line + first[index]).join(""),
          second: lines.map((line, index) => line + second[index]).join(""),
          canonical: lines
            .map((line, index) => line + (terminated || index < lines.length - 1 ? LF : ""))
            .join(""),
        };
      });
    });
}

export function arbitraryVerificationInputFileScenario(): fc.Arbitrary<VerificationInputFileScenario> {
  return fc
    .tuple(arbitraryProductRelativePath(), arbitraryProductRelativePath(), arbitraryByteSequence())
    .filter(([path, otherPath]) => path !== otherPath)
    .map(([path, otherPath, bytes]) => ({ path, otherPath, bytes }));
}

export function arbitraryTextFileScenario(): fc.Arbitrary<TextFileScenario> {
  return fc
    .tuple(arbitraryProductRelativePath(), arbitraryProductRelativePath(), arbitraryLineEndingVariants())
    .filter(([path, otherPath]) => path !== otherPath)
    .map(([path, otherPath, variants]) => ({ path, otherPath, variants }));
}

/** A file whose bytes open with a UTF-8 byte-order mark before generated text. */
export function arbitraryByteOrderMarkScenario(): fc.Arbitrary<ByteOrderMarkScenario> {
  return fc.tuple(arbitraryProductRelativePath(), arbitraryLineEndingVariants()).map(([path, variants]) => ({
    path,
    bytes: Uint8Array.from([...BYTE_ORDER_MARK_BYTES, ...new TextEncoder().encode(variants.first)]),
    canonicalTextWithMark: BYTE_ORDER_MARK_CHARACTER + variants.canonical,
  }));
}

/** Names for the rejection cases: one product path, one file name, and two distinct directories. */
export function arbitraryRejectionScenario(): fc.Arbitrary<RejectionScenario> {
  return fc
    .tuple(arbitraryProductRelativePath(), arbitrarySegment(), arbitrarySegment(), arbitrarySegment())
    .filter(([, , firstDirectory, secondDirectory]) => firstDirectory !== secondDirectory)
    .map(([path, stem, firstDirectory, secondDirectory]) => ({
      path,
      name: `${stem}.${TEXT_FILE_EXTENSION}`,
      firstDirectory,
      secondDirectory,
    }));
}

/** An operand spelled from printable segments around one control byte, resolving to no product file. */
export interface ControlByteOperandScenario {
  readonly operand: string;
  readonly controlByte: string;
  readonly printablePrefix: string;
}

const CONTROL_BYTES = ["\u001b", "\u0007", "\u0008", "\u007f"] as const;

/** An operand carrying a control byte that a terminal would act on, so an unescaped echo is observable. */
export function arbitraryControlByteOperand(): fc.Arbitrary<ControlByteOperandScenario> {
  return fc
    .tuple(arbitrarySegment(), fc.constantFrom(...CONTROL_BYTES), arbitrarySegment())
    .map(([printablePrefix, controlByte, suffix]) => ({
      operand: `${printablePrefix}${controlByte}${suffix}`,
      controlByte,
      printablePrefix,
    }));
}

export const VERIFICATION_INPUT_TEST_GENERATOR = {
  controlByteOperand: arbitraryControlByteOperand,
  byteSequence: arbitraryByteSequence,
  invalidUtf8: arbitraryInvalidUtf8,
  lineEndingVariants: arbitraryLineEndingVariants,
  fileScenario: arbitraryVerificationInputFileScenario,
  textFileScenario: arbitraryTextFileScenario,
  byteOrderMarkScenario: arbitraryByteOrderMarkScenario,
  rejectionScenario: arbitraryRejectionScenario,
  nestedProductRelativePath: arbitraryNestedProductRelativePath,
  productRelativePath: arbitraryProductRelativePath,
} as const;

export function sampleVerificationInputValue<T>(arbitrary: fc.Arbitrary<T>): T {
  return sampleGeneratedValue(arbitrary);
}

export interface OperandDirectories {
  /** Absolute path of the worktree root. */
  readonly root: string;
  /** Absolute path of an existing directory that is neither the root nor a directory of the file. */
  readonly elsewhere: string;
}

export interface OperandForSpelling {
  readonly operand: string;
  readonly invocationDir: string;
  /**
   * Whether `git ls-files --cached --others --exclude-standard` lists the file. A spelling that
   * names a join with the invocation directory or the worktree root is arranged with the file
   * unlisted, so no suffix match can resolve it.
   */
  readonly listedByGit: boolean;
}

/**
 * Construction law from the governing spec: an absolute operand is the file's absolute path; a
 * relative operand is the path relative to the invocation directory, relative to the worktree
 * root, or a complete-path-component suffix of the root-relative path. Each relative spelling is
 * built so only its own candidate source reaches the file: the file name from its own directory
 * with the file unlisted, the root-relative path from an unrelated invocation directory with the
 * file unlisted, and a proper suffix from an unrelated invocation directory with the file listed.
 */
export function operandForSpelling(
  spelling: OperandSpelling,
  directories: OperandDirectories,
  relativePath: string,
): OperandForSpelling {
  const { root, elsewhere } = directories;
  const components = relativePath.split("/");
  const directory = components.slice(0, -1).join("/");
  const name = components[components.length - 1] ?? relativePath;
  switch (spelling) {
    case OPERAND_SPELLING.ABSOLUTE:
      return { operand: `${root}/${relativePath}`, invocationDir: root, listedByGit: true };
    case OPERAND_SPELLING.FROM_INVOCATION_DIRECTORY:
      return { operand: name, invocationDir: `${root}/${directory}`, listedByGit: false };
    case OPERAND_SPELLING.FROM_WORKTREE_ROOT:
      return { operand: relativePath, invocationDir: elsewhere, listedByGit: false };
    case OPERAND_SPELLING.PATH_SUFFIX:
      return { operand: components.slice(1).join("/"), invocationDir: elsewhere, listedByGit: true };
  }
}
