"use strict";

const { defineConfig } = require("@playwright/test");

const HEADLESS = process.env.HEADLESS === "1";

module.exports = defineConfig({
  testDir: "./scenarios",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [["list"]],
  use: {
    actionTimeout: 10_000,
    trace: "retain-on-failure",
  },
  metadata: {
    headless: HEADLESS,
  },
});
