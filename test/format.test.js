import test from "node:test";
import assert from "node:assert/strict";
import { shortAddr, fmtNum, fmtUsd, solscanTx, strategyLabel } from "../bot/format.js";

test("shortAddr", () => {
  assert.equal(shortAddr("So11111111111111111111111111111111111111112"), "So11..1112");
});
test("fmtNum trims", () => {
  assert.equal(fmtNum(1.5), "1.5");
  assert.equal(fmtNum(0.123456, 4), "0.1235");
});
test("fmtUsd", () => {
  assert.equal(fmtUsd(1234.5), "$1,234.50");
  assert.equal(fmtUsd(-3.2), "-$3.20");
});
test("solscanTx", () => {
  assert.equal(solscanTx("abc"), "https://solscan.io/tx/abc");
});
test("strategyLabel", () => {
  assert.equal(strategyLabel("spot"), "Spot");
  assert.equal(strategyLabel("bid_ask"), "Bid-Ask");
  assert.equal(strategyLabel("curve"), "Curve");
});
