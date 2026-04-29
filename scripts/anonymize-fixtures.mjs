#!/usr/bin/env node

// Reads raw SoMA HTML captures from .agent/raw/, runs the anonymization
// library, and writes anonymized copies into tests/fixtures/site-current/
// and/or mock/. Intended to be invoked via `npm run refresh:fixtures`.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { anonymizeHtml, findResidualPii } from "./lib/anonymize.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const RAW_DIR = path.join(rootDir, ".agent", "raw");
const FIXTURE_DIR = path.join(rootDir, "tests", "fixtures", "site-current");
const MOCK_DIR = path.join(rootDir, "mock");

const SOURCES = [
  {
    profile: "list",
    raw: "list.raw.html",
    fixture: "list.html",
    mock: "list.html"
  },
  {
    profile: "detail",
    raw: "view-apply.raw.html",
    fixture: "detail.html",
    mock: "view-apply.html"
  },
  {
    profile: "history",
    raw: "history.raw.html",
    fixture: "history.html",
    mock: "history.html"
  }
];

function parseArgs(argv) {
  const opts = { target: "fixture", dry: false, input: null };
  for (const arg of argv) {
    if (arg.startsWith("--target=")) {
      const v = arg.slice("--target=".length).trim();
      if (!["fixture", "mock", "both"].includes(v)) {
        throw new Error(`Invalid --target: ${v} (use fixture|mock|both)`);
      }
      opts.target = v;
      continue;
    }
    if (arg === "--dry" || arg === "--dry-run") {
      opts.dry = true;
      continue;
    }
    if (arg.startsWith("--input=")) {
      opts.input = arg.slice("--input=".length).trim();
      continue;
    }
    if (arg === "--input") {
      // value comes next — handled by reduce below; simpler: throw to demand =.
      throw new Error("Use --input=<path> with the equals form");
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return opts;
}

function printHelp() {
  console.log([
    "Usage:",
    "  npm run refresh:fixtures",
    "  npm run refresh:fixtures -- --target=mock",
    "  npm run refresh:fixtures -- --target=both --dry",
    "  npm run refresh:fixtures -- --input=.agent/raw/list.raw.html",
    "",
    "Options:",
    "  --target=fixture|mock|both  Where to write anonymized output (default fixture)",
    "  --input=<path>              Process only this raw file (matched to a known profile)",
    "  --dry                       Print intended writes; do not touch the filesystem",
    "  --help, -h                  Show this message",
    "",
    "Inputs are read from .agent/raw/ and must be saved by the user from",
    "Chrome DevTools (Save as → HTML, Page Source). Raw inputs are gitignored.",
    ""
  ].join("\n"));
}

function relativeToRoot(absPath) {
  return path.relative(rootDir, absPath) || ".";
}

function processSource(source, opts) {
  const rawPath = opts.input
    ? path.resolve(rootDir, opts.input)
    : path.join(RAW_DIR, source.raw);

  if (!existsSync(rawPath)) {
    return { source, status: "skipped", reason: "raw file not found", rawPath };
  }

  const html = readFileSync(rawPath, "utf8");
  const anonymized = anonymizeHtml(html, { profile: source.profile });
  const residual = findResidualPii(anonymized);

  const writes = [];
  if (opts.target === "fixture" || opts.target === "both") {
    writes.push(path.join(FIXTURE_DIR, source.fixture));
  }
  if (opts.target === "mock" || opts.target === "both") {
    writes.push(path.join(MOCK_DIR, source.mock));
  }

  if (!opts.dry) {
    for (const dest of writes) {
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(dest, anonymized, "utf8");
    }
  }

  return {
    source,
    status: "ok",
    rawPath,
    writes,
    residual,
    bytesIn: html.length,
    bytesOut: anonymized.length
  };
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }

  if (!existsSync(RAW_DIR) && !opts.input) {
    console.error(`Raw directory not found: ${relativeToRoot(RAW_DIR)}`);
    console.error("Save raw HTML captures there (see docs/agent-troubleshooting/refresh-fixtures.md).");
    process.exit(1);
  }

  let processed = 0;
  let residualTotal = 0;
  const results = [];

  for (const source of SOURCES) {
    if (opts.input && !opts.input.endsWith(source.raw)) continue;
    const result = processSource(source, opts);
    results.push(result);
    if (result.status === "ok") processed += 1;
  }

  if (processed === 0) {
    if (opts.input) {
      console.error(`Input did not match any known profile: ${opts.input}`);
    } else {
      console.error(`No raw captures found in ${relativeToRoot(RAW_DIR)}/`);
      console.error("Expected at least one of:");
      for (const s of SOURCES) console.error(`  - ${s.raw}`);
    }
    process.exit(1);
  }

  for (const result of results) {
    if (result.status === "skipped") {
      console.log(`skip ${result.source.profile}: ${result.reason} (${relativeToRoot(result.rawPath)})`);
      continue;
    }
    const verb = opts.dry ? "would write" : "wrote";
    for (const dest of result.writes) {
      console.log(`${verb} ${relativeToRoot(dest)} (${result.bytesIn} -> ${result.bytesOut} bytes)`);
    }
    if (result.residual.length > 0) {
      residualTotal += result.residual.length;
      console.error(`  residual PII detected in ${result.source.profile}:`);
      for (const r of result.residual.slice(0, 20)) {
        console.error(`    ${r}`);
      }
    }
  }

  if (residualTotal > 0) {
    console.error(`Self-check failed: ${residualTotal} residual PII finding(s).`);
    process.exit(1);
  }

  if (opts.dry) {
    console.log("(dry run — no files written)");
  }
}

main();
