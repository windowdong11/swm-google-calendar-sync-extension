const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

test("manifest injects content scripts on swmaestro root and www domains", () => {
  const manifest = readJson("manifest.json");
  const matches = manifest.content_scripts.flatMap((script) => script.matches || []);

  assert.ok(manifest.host_permissions.includes("https://swmaestro.ai/*"));
  assert.ok(manifest.host_permissions.includes("https://www.swmaestro.ai/*"));
  assert.ok(matches.includes("https://swmaestro.ai/sw/mypage/mentoLec/list.do*"));
  assert.ok(matches.includes("https://www.swmaestro.ai/sw/mypage/mentoLec/list.do*"));
  assert.ok(matches.includes("https://swmaestro.ai/sw/mypage/mentoLec/view.do*"));
  assert.ok(matches.includes("https://www.swmaestro.ai/sw/mypage/mentoLec/view.do*"));
  assert.ok(matches.includes("https://swmaestro.ai/sw/mypage/userAnswer/history.do*"));
  assert.ok(matches.includes("https://www.swmaestro.ai/sw/mypage/userAnswer/history.do*"));
});

test("manifest and package versions stay aligned", () => {
  const manifest = readJson("manifest.json");
  const packageJson = readJson("package.json");

  assert.equal(manifest.version, packageJson.version);
});
