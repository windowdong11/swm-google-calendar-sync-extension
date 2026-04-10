#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const manifestPath = path.join(rootDir, "manifest.json");

const args = process.argv.slice(2);
let oauthClientId = "";
let outDir = path.join(rootDir, "dist");
let includeKey = false;

for (const arg of args) {
  if (arg.startsWith("--oauth-client-id=")) {
    oauthClientId = arg.slice("--oauth-client-id=".length).trim();
    continue;
  }

  if (arg.startsWith("--out-dir=")) {
    const value = arg.slice("--out-dir=".length).trim();
    outDir = path.resolve(rootDir, value);
    continue;
  }

  if (arg === "--include-key") {
    includeKey = true;
    continue;
  }

  if (arg === "--help" || arg === "-h") {
    console.log([
      "Usage:",
      "  node scripts/build-release.mjs",
      "  node scripts/build-release.mjs --oauth-client-id=<client-id>",
      "  node scripts/build-release.mjs --out-dir=dist",
      "",
      "Options:",
      "  --include-key   Keep manifest.key in the generated ZIP.",
      "                  Omit this for first Chrome Web Store upload."
    ].join("\n"));
    process.exit(0);
  }

  console.error(`Unknown option: ${arg}`);
  process.exit(1);
}

if (!existsSync(manifestPath)) {
  console.error(`manifest.json not found: ${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const releaseManifest = structuredClone(manifest);

if (oauthClientId) {
  releaseManifest.oauth2 = {
    ...(releaseManifest.oauth2 || {}),
    client_id: oauthClientId
  };
}

const sourceKey = releaseManifest.key || "";
if (!includeKey) {
  delete releaseManifest.key;
}

const version = releaseManifest.version;
if (!version) {
  console.error("manifest.json is missing a version field.");
  process.exit(1);
}

const packageName = `soma-schedule-helper-v${version}`;
const tempRoot = mkdtempSync(path.join(os.tmpdir(), "soma-schedule-helper-"));
const stageDir = path.join(tempRoot, packageName);
const zipPath = path.join(outDir, `${packageName}.zip`);

function getExtensionId(base64Key) {
  if (!base64Key) return "";

  const alphabet = "abcdefghijklmnop";
  const hash = crypto
    .createHash("sha256")
    .update(Buffer.from(base64Key, "base64"))
    .digest();

  return Array.from(hash.subarray(0, 16), (byte) => {
    return `${alphabet[(byte >> 4) & 0x0f]}${alphabet[byte & 0x0f]}`;
  }).join("");
}

try {
  mkdirSync(outDir, { recursive: true });
  mkdirSync(stageDir, { recursive: true });
  rmSync(zipPath, { force: true });

  for (const entry of ["src", "icons"]) {
    const sourcePath = path.join(rootDir, entry);
    if (!existsSync(sourcePath)) {
      throw new Error(`Missing required path: ${sourcePath}`);
    }
    cpSync(sourcePath, path.join(stageDir, entry), { recursive: true });
  }

  writeFileSync(
    path.join(stageDir, "manifest.json"),
    `${JSON.stringify(releaseManifest, null, 2)}\n`,
    "utf8"
  );

  execFileSync(
    "zip",
    ["-rq", "-FS", zipPath, "manifest.json", "src", "icons"],
    { cwd: stageDir, stdio: "inherit" }
  );

  const devExtensionId = getExtensionId(sourceKey);
  const releaseExtensionId = getExtensionId(releaseManifest.key);

  console.log(`Created release ZIP: ${zipPath}`);
  console.log(`Version: ${version}`);
  console.log(
    `OAuth client ID: ${releaseManifest.oauth2?.client_id || "(missing)"}`
  );
  console.log(`Manifest key included in ZIP: ${includeKey ? "yes" : "no"}`);
  if (releaseExtensionId) {
    console.log(`ZIP extension ID: ${releaseExtensionId}`);
  } else {
    console.log("ZIP extension ID: determined by Chrome Web Store after first upload");
  }
  if (devExtensionId) {
    console.log(`Local source extension ID: ${devExtensionId}`);
  }
  if (!includeKey) {
    console.log(
      "Note: after the first dashboard upload, copy the dashboard public key back into manifest.json to keep local and store IDs aligned."
    );
  }
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
