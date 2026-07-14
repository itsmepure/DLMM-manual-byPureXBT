import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

process.env.STORE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "dlmm-store-"));
const { loadSettings, saveSettings, loadPositions, addPosition, removePosition, setAlerted } =
  await import("../store.js");

test("settings default dibuat saat pertama load", () => {
  const s = loadSettings();
  assert.deepEqual(s.amountPresets, [0.5, 1, 2]);
  assert.deepEqual(s.rangePresets, [
    { down: 30, up: 0 },
    { down: 40, up: 0 },
    { down: 50, up: 0 },
  ]);
});

test("saveSettings lalu loadSettings roundtrip", () => {
  saveSettings({ amountPresets: [0.1], rangePresets: [{ down: 7, up: 2 }] });
  const s = loadSettings();
  assert.deepEqual(s.amountPresets, [0.1]);
});

test("positions add/remove/alerted", () => {
  assert.deepEqual(loadPositions(), []);
  addPosition({ position: "P1", pool: "POOL1", pool_name: "X-SOL", strategy: "spot",
    amount_sol: 1, min_bin: 10, max_bin: 50, opened_at: "2026-07-14T00:00:00Z", alerted: false });
  assert.equal(loadPositions().length, 1);
  setAlerted("P1", true);
  assert.equal(loadPositions()[0].alerted, true);
  removePosition("P1");
  assert.deepEqual(loadPositions(), []);
});
