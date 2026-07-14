import test from "node:test";
import assert from "node:assert/strict";
import config, { MIN_SAFE_BINS_BELOW } from "../config.js";

test("MIN_SAFE_BINS_BELOW is 35", () => {
  assert.equal(MIN_SAFE_BINS_BELOW, 35);
});

test("config has required keys", () => {
  assert.equal(config.tokens.sol, "So11111111111111111111111111111111111111112");
  assert.equal(config.tokens.usdc, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  assert.ok(config.pnl);
  assert.equal(config.pnl.source, "rpc");
  assert.ok(config.strategy.strategy);
  assert.ok(config.management.gasReserve > 0);
});
