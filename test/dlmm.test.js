import test from "node:test";
import assert from "node:assert/strict";
import { getDLMM } from "../engine/dlmm.js";

test("SDK strategy enum has Spot/BidAsk/Curve", async () => {
  const { StrategyType } = await getDLMM();
  assert.ok(StrategyType.Spot !== undefined);
  assert.ok(StrategyType.BidAsk !== undefined);
  assert.ok(StrategyType.Curve !== undefined);
});

test("pct->bin conversion math is sane (pure SDK fns)", async () => {
  const { getBinIdFromPrice, getPriceOfBinByBinId } = await getDLMM();
  const binStep = 100; // 1% per bin
  const activeBinId = 0;
  const activePrice = Number(getPriceOfBinByBinId(activeBinId, binStep).toString());
  // -10% target => sekitar 10-11 bins di bawah untuk binStep 1%
  const targetPrice = activePrice * 0.9;
  const targetBinId = Number(getBinIdFromPrice(targetPrice, binStep, true).toString());
  const binsBelow = activeBinId - targetBinId;
  assert.ok(binsBelow >= 9 && binsBelow <= 12, `binsBelow=${binsBelow}`);
});
