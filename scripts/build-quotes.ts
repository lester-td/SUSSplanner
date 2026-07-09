#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_INPUT = "app/data/quotes.txt";
const DEFAULT_OUTPUT = "app/quotes.json";
const MIN_QUOTE_LENGTH = 40;
const MAX_QUOTE_LENGTH = 140;
const NEAR_DUPLICATE_THRESHOLD = 0.6;
const MAX_REPORTED_NEAR_DUPLICATES = 10;

type QuoteItem = {
  lineNumber: number;
  quote: string;
};

type ParsedArgs = {
  input: string;
  output: string;
};

type ReadResult = {
  quotes: QuoteItem[];
  blankLines: number[];
  removedQuotes: string[];
};

type QuoteJsonItem = {
  id: number;
  quote: string;
};

const unsupportedCharacterRegex = /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]|\p{Extended_Pictographic}|\p{Regional_Indicator}/gu;

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--input") {
      args.input = requireArgValue(requireNextValue(argv, index, "--input"), "--input");
      index += 1;
      continue;
    }

    if (arg.startsWith("--input=")) {
      args.input = requireArgValue(arg.slice("--input=".length), "--input");
      continue;
    }

    if (arg === "--output") {
      args.output = requireArgValue(requireNextValue(argv, index, "--output"), "--output");
      index += 1;
      continue;
    }

    if (arg.startsWith("--output=")) {
      args.output = requireArgValue(arg.slice("--output=".length), "--output");
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function requireNextValue(argv: string[], index: number, name: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }

  return value;
}

function requireArgValue(value: string, name: string): string {
  if (value.trim().length === 0) {
    throw new Error(`${name} requires a non-empty value.`);
  }

  return value;
}

function printHelp(): void {
  process.stdout.write(`
Build app/quotes.json from newline-separated quotes in app/data/quotes.txt.

Options:
  --input <path>   Source text file. Default: ${DEFAULT_INPUT}
  --output <path>  Destination JSON file. Default: ${DEFAULT_OUTPUT}
`);
}

function normalizeQuote(value: string): string {
  const [quoteWithoutAttribution] = value.split("—", 1);
  return quoteWithoutAttribution
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function quoteWords(value: string): Set<string> {
  return new Set(normalizeQuote(value).split(" ").filter((word) => word.length > 2));
}

async function readQuotes(inputPath: string): Promise<ReadResult> {
  const content = await fs.readFile(inputPath, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      throw new Error(`${inputPath} does not exist.`);
    }

    throw error;
  });

  const quotes: QuoteItem[] = [];
  const blankLines: number[] = [];
  const removedQuotes: string[] = [];

  const lines = content.split(/\r?\n/u);
  if (lines.at(-1) === "") {
    lines.pop();
  }

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    const quote = cleanQuote(line);

    if (!quote) {
      blankLines.push(lineNumber);
      continue;
    }

    const unsupportedCharacters = getUnsupportedCharacters(quote);
    if (unsupportedCharacters.length > 0) {
      removedQuotes.push(
        `[error] Line ${lineNumber} was automatically removed because it contains unsupported characters: ${formatCharacters(unsupportedCharacters)}.`
      );
      continue;
    }

    quotes.push({ lineNumber, quote });
  }

  return { quotes, blankLines, removedQuotes };
}

function cleanQuote(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function getUnsupportedCharacters(value: string): string[] {
  unsupportedCharacterRegex.lastIndex = 0;
  return Array.from(new Set(value.match(unsupportedCharacterRegex) ?? []));
}

function formatCharacters(characters: string[]): string {
  return characters.map((character) => JSON.stringify(character)).join(", ");
}

function findDuplicateGroups(items: QuoteItem[], keyFn: (quote: string) => string): QuoteItem[][] {
  const seen = new Map<string, QuoteItem[]>();

  for (const item of items) {
    const key = keyFn(item.quote);
    seen.set(key, [...(seen.get(key) ?? []), item]);
  }

  return Array.from(seen.values()).filter((group) => group.length > 1);
}

function findNearDuplicates(items: QuoteItem[]): Array<{
  score: number;
  left: QuoteItem;
  right: QuoteItem;
}> {
  const candidates: Array<{
    score: number;
    left: QuoteItem;
    right: QuoteItem;
  }> = [];
  const wordSets = items.map((item) => ({
    item,
    words: quoteWords(item.quote),
  }));

  for (let leftIndex = 0; leftIndex < wordSets.length; leftIndex += 1) {
    const left = wordSets[leftIndex];

    for (const right of wordSets.slice(leftIndex + 1)) {
      if (left.words.size === 0 || right.words.size === 0) {
        continue;
      }

      const intersectionSize = [...left.words].filter((word) => right.words.has(word)).length;
      const unionSize = new Set([...left.words, ...right.words]).size;
      const score = intersectionSize / unionSize;

      if (score >= NEAR_DUPLICATE_THRESHOLD) {
        candidates.push({ score, left: left.item, right: right.item });
      }
    }
  }

  return candidates.sort((left, right) => right.score - left.score);
}

function validateQuotes(items: QuoteItem[]): string[] {
  const errors: string[] = [];
  const reportedDuplicatePairs = new Set<string>();

  if (items.length === 0) {
    errors.push("No quotes were found.");
  }

  for (const item of items) {
    const quoteLength = Array.from(item.quote).length;

    if (quoteLength < MIN_QUOTE_LENGTH) {
      errors.push(`Line ${item.lineNumber} is shorter than ${MIN_QUOTE_LENGTH} characters.`);
    }

    if (quoteLength > MAX_QUOTE_LENGTH) {
      errors.push(`Line ${item.lineNumber} is longer than ${MAX_QUOTE_LENGTH} characters.`);
    }
  }

  const exactDuplicates = findDuplicateGroups(items, (quote) => quote);
  for (const group of exactDuplicates) {
    errors.push(`Exact duplicate quote on lines ${formatLines(group)}.`);
    addDuplicatePairs(reportedDuplicatePairs, group);
  }

  const normalizedDuplicates = findDuplicateGroups(items, normalizeQuote);
  for (const group of normalizedDuplicates) {
    const nonExactRepresentatives = uniqueQuoteRepresentatives(group);
    if (nonExactRepresentatives.length > 1) {
      errors.push(`Normalized duplicate quote on lines ${formatLines(nonExactRepresentatives)}.`);
      addDuplicatePairs(reportedDuplicatePairs, group);
    }
  }

  const nearDuplicates = findNearDuplicates(items);
  const reportableNearDuplicates = nearDuplicates.filter(({ left, right }) => {
    return !reportedDuplicatePairs.has(pairKey(left.lineNumber, right.lineNumber));
  });

  for (const { score, left, right } of reportableNearDuplicates.slice(0, MAX_REPORTED_NEAR_DUPLICATES)) {
    errors.push(
      `Near-duplicate candidate on lines ${left.lineNumber} and ${right.lineNumber} ` +
        `(score ${score.toFixed(2)}): ${JSON.stringify(left.quote)} / ${JSON.stringify(right.quote)}`
    );
  }

  if (reportableNearDuplicates.length > MAX_REPORTED_NEAR_DUPLICATES) {
    errors.push(`${reportableNearDuplicates.length - MAX_REPORTED_NEAR_DUPLICATES} additional near-duplicate candidates were omitted.`);
  }

  return errors;
}

function addDuplicatePairs(pairs: Set<string>, group: QuoteItem[]): void {
  for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
    for (const right of group.slice(leftIndex + 1)) {
      pairs.add(pairKey(group[leftIndex].lineNumber, right.lineNumber));
    }
  }
}

function pairKey(leftLine: number, rightLine: number): string {
  return leftLine < rightLine ? `${leftLine}:${rightLine}` : `${rightLine}:${leftLine}`;
}

function uniqueQuoteRepresentatives(group: QuoteItem[]): QuoteItem[] {
  const representatives = new Map<string, QuoteItem>();

  for (const item of group) {
    if (!representatives.has(item.quote)) {
      representatives.set(item.quote, item);
    }
  }

  return Array.from(representatives.values());
}

function formatLines(group: QuoteItem[]): string {
  return group.map((item) => item.lineNumber).join(", ");
}

function buildJson(items: QuoteItem[]): QuoteJsonItem[] {
  return items.map((item, index) => ({
    id: index + 1,
    quote: item.quote,
  }));
}

function appendBlankLineErrors(errors: string[], blankLines: number[]): void {
  if (blankLines.length === 0) {
    return;
  }

  const joinedLines = blankLines.slice(0, 20).join(", ");
  const suffix = blankLines.length > 20 ? " ..." : "";
  errors.push(`Blank lines are not allowed. Found blank lines at: ${joinedLines}${suffix}.`);
}

function buildReport(
  input: string,
  output: string,
  quoteCount: number,
  removedQuotes: string[],
  errors: string[],
  outputRemovalMessage: string | null
): string {
  const lines: string[] = [];

  if (removedQuotes.length > 0) {
    lines.push("Quote data errors automatically removed:");
    for (const message of removedQuotes) {
      lines.push(`- ${message}`);
    }
    lines.push("");
  }

  if (errors.length > 0) {
    lines.push(`${output} was not written because validation failed:`);
    for (const error of errors) {
      lines.push(`- ${error}`);
    }

    if (outputRemovalMessage) {
      lines.push(outputRemovalMessage);
    }

    return `${lines.join("\n")}\n`;
  }

  lines.push(`Wrote ${output} from ${input} with ${quoteCount} quotes.`);
  lines.push(`Automatically removed ${removedQuotes.length} unsupported quote${removedQuotes.length === 1 ? "" : "s"}.`);

  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const input = path.normalize(args.input);
  const output = path.normalize(args.output);
  const { quotes, blankLines, removedQuotes } = await readQuotes(input);
  const errors = validateQuotes(quotes);

  appendBlankLineErrors(errors, blankLines);
  let outputRemovalMessage: string | null = null;

  if (errors.length === 0) {
    try {
      await fs.mkdir(path.dirname(output), { recursive: true });
      await fs.writeFile(output, `${JSON.stringify(buildJson(quotes), null, 2)}\n`, "utf8");
    } catch (error) {
      throw new Error(`Failed to write ${output}: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    try {
      await fs.rm(output, { force: true });
      outputRemovalMessage = `Removed any existing ${output} because validation failed.`;
    } catch (error) {
      errors.push(`Failed to remove existing ${output} after validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const report = buildReport(input, output, quotes.length, removedQuotes, errors, outputRemovalMessage);

  if (errors.length > 0) {
    process.stderr.write(report);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(report);
}

main().catch((error: unknown) => {
  process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
