import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMint } from "../engine/wallet.js";

const WSOL = "So11111111111111111111111111111111111111112";

test("normalizeMint maps SOL aliases", () => {
  assert.equal(normalizeMint("SOL"), WSOL);
  assert.equal(normalizeMint("native"), WSOL);
  assert.equal(normalizeMint(WSOL), WSOL);
});

test("normalizeMint passes through other mints", () => {
  const usdc = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  assert.equal(normalizeMint(usdc), usdc);
});
