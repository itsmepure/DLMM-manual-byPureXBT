import { sendMessage, sendMessageWithButtons, editMessageWithButtons } from "../telegram.js";
import { searchPools, getActiveBin, deployPosition } from "../engine/dlmm.js";
import { getWalletBalances } from "../engine/wallet.js";
import { loadSettings, addPosition } from "../store.js";
import { getSession, resetSession } from "./session.js";
import config from "../config.js";
import { fmtNum, fmtUsd, shortAddr, solscanTx, strategyLabel } from "./format.js";

const CANCEL_ROW = [{ text: "❌ Batal", callback_data: "cancel" }];
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

async function askMint(messageId) {
  const s = getSession();
  s.step = "dep_mint";
  s.data = {};
  s.awaitingText = onMintInput;
  const text = "🚀 Deploy — paste token mint address:";
  if (messageId) return editMessageWithButtons(text, messageId, [CANCEL_ROW]);
  return sendMessageWithButtons(text, [CANCEL_ROW]);
}

async function onMintInput(text) {
  const mint = text.trim();
  if (!BASE58_RE.test(mint)) {
    getSession().awaitingText = onMintInput;
    return sendMessage("Itu bukan address base58 yang valid. Paste ulang token mint:");
  }
  const res = await searchPools({ query: mint, limit: 6 });
  if (!res.pools.length) {
    getSession().awaitingText = onMintInput;
    return sendMessage("Tidak ada pool DLMM untuk token itu. Coba mint lain:");
  }
  const s = getSession();
  s.step = "dep_pool";
  s.data.pools = res.pools;
  const rows = res.pools.map((p, i) => [{
    text: `${p.name} | step ${p.bin_step} | fee ${fmtNum(p.fee_pct, 2)}% | TVL ${fmtUsd(p.tvl)}`,
    callback_data: `dep:pool:${i}`,
  }]);
  rows.push(CANCEL_ROW);
  return sendMessageWithButtons("Pilih pool:", rows);
}

async function onPool(msg, i) {
  const s = getSession();
  const pool = s.data.pools?.[Number(i)];
  if (!pool) return sendMessage("Sesi kadaluarsa — mulai lagi dari /menu.");
  s.data.pool = pool;
  s.step = "dep_strat";
  return editMessageWithButtons(`Pool: ${pool.name}\nPilih strategi:`, msg.messageId, [
    [{ text: "Spot", callback_data: "dep:strat:spot" },
     { text: "Bid-Ask", callback_data: "dep:strat:bid_ask" },
     { text: "Curve", callback_data: "dep:strat:curve" }],
    CANCEL_ROW,
  ]);
}

async function onStrategy(msg, strat) {
  const s = getSession();
  if (!s.data.pool) return sendMessage("Sesi kadaluarsa — mulai lagi dari /menu.");
  s.data.strategy = strat;
  s.step = "dep_amt";
  const presets = loadSettings().amountPresets;
  const rows = [presets.map((a, i) => ({ text: `${a} SOL`, callback_data: `dep:amt:${i}` }))];
  rows.push([{ text: "✏️ Ketik manual", callback_data: "dep:amt:c" }]);
  rows.push(CANCEL_ROW);
  return editMessageWithButtons(
    `Strategi: ${strategyLabel(strat)}\nPilih jumlah SOL:`, msg.messageId, rows);
}

async function onAmount(msg, arg) {
  const s = getSession();
  if (!s.data.pool) return sendMessage("Sesi kadaluarsa — mulai lagi dari /menu.");
  if (arg === "c") {
    s.awaitingText = onAmountInput;
    return sendMessage("Ketik jumlah SOL (mis. 0.75):");
  }
  const amount = loadSettings().amountPresets[Number(arg)];
  if (!amount) return sendMessage("Preset tidak ditemukan — mulai lagi dari /menu.");
  s.data.amount_sol = amount;
  return askRange(msg.messageId);
}

async function onAmountInput(text) {
  const amount = Number(text.replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) {
    getSession().awaitingText = onAmountInput;
    return sendMessage("Angka tidak valid. Ketik jumlah SOL:");
  }
  getSession().data.amount_sol = amount;
  return askRange(null);
}

async function askRange(messageId) {
  const s = getSession();
  s.step = "dep_rng";
  const presets = loadSettings().rangePresets;
  const rows = [presets.map((r, i) => ({ text: `-${r.down}% / +${r.up}%`, callback_data: `dep:rng:${i}` }))];
  rows.push([{ text: "✏️ Ketik bin manual", callback_data: "dep:rng:c" }]);
  rows.push(CANCEL_ROW);
  const text = `Amount: ${s.data.amount_sol} SOL\nPilih range:`;
  if (messageId) return editMessageWithButtons(text, messageId, rows);
  return sendMessageWithButtons(text, rows);
}

async function onRange(msg, arg) {
  const s = getSession();
  if (!s.data.pool) return sendMessage("Sesi kadaluarsa — mulai lagi dari /menu.");
  if (arg === "c") {
    s.awaitingText = onRangeInput;
    return sendMessage("Ketik `bins_below bins_above` (mis. `40 5`):");
  }
  const r = loadSettings().rangePresets[Number(arg)];
  if (!r) return sendMessage("Preset tidak ditemukan — mulai lagi dari /menu.");
  s.data.downside_pct = r.down;
  s.data.upside_pct = r.up;
  return confirmScreen(msg.messageId);
}

async function onRangeInput(text) {
  const m = text.trim().match(/^(\d+)\s+(\d+)$/);
  if (!m) {
    getSession().awaitingText = onRangeInput;
    return sendMessage("Format: dua angka dipisah spasi, mis. `40 5`. Coba lagi:");
  }
  const s = getSession();
  s.data.bins_below = Number(m[1]);
  s.data.bins_above = Number(m[2]);
  return confirmScreen(null);
}

async function confirmScreen(messageId) {
  const s = getSession();
  const d = s.data;
  s.step = "dep_confirm";
  const [ab, bal] = await Promise.all([
    getActiveBin({ pool_address: d.pool.pool }),
    getWalletBalances({}),
  ]);
  d.active_price = ab.price;
  const need = d.amount_sol + config.management.gasReserve;
  const enough = bal.sol >= need;
  const rangeLine = d.downside_pct != null
    ? `Range: -${d.downside_pct}% / +${d.upside_pct}%`
    : `Range: ${d.bins_below} bins bawah / ${d.bins_above} bins atas`;
  const lines = [
    "⚠️ KONFIRMASI DEPLOY",
    `Pool: ${d.pool.name} (${shortAddr(d.pool.pool)})`,
    `Strategi: ${strategyLabel(d.strategy)}`,
    `Amount: ${d.amount_sol} SOL (single-sided)`,
    rangeLine,
    `Harga aktif: ${fmtNum(ab.price, 8)}`,
    `Saldo SOL: ${fmtNum(bal.sol)} — butuh ~${fmtNum(need)} (termasuk gas reserve)`,
  ];
  if (!enough) lines.push("❌ SALDO TIDAK CUKUP — kurangi amount atau batalkan.");
  const rows = enough
    ? [[{ text: "✅ Deploy", callback_data: "dep:go" }, { text: "❌ Batal", callback_data: "cancel" }]]
    : [CANCEL_ROW];
  const text = lines.join("\n");
  if (messageId) return editMessageWithButtons(text, messageId, rows);
  return sendMessageWithButtons(text, rows);
}

async function onConfirm(msg, _arg, mainMenu) {
  const s = getSession();
  const d = s.data;
  if (s.step !== "dep_confirm" || !d.pool) return sendMessage("Sesi kadaluarsa — mulai lagi dari /menu.");
  s.step = "dep_sending";
  await editMessageWithButtons("⏳ Mengirim transaksi deploy…", msg.messageId, []);
  const res = await deployPosition({
    pool_address: d.pool.pool,
    strategy: d.strategy,
    amount_sol: d.amount_sol,
    bins_below: d.bins_below,
    bins_above: d.bins_above,
    downside_pct: d.downside_pct,
    upside_pct: d.upside_pct,
    pool_name: d.pool.name,
  });
  if (!res.success) {
    resetSession();
    await sendMessage(`❌ Deploy gagal: ${res.error}`);
    return mainMenu();
  }
  addPosition({
    position: res.position,
    pool: res.pool,
    pool_name: res.pool_name || d.pool.name,
    strategy: d.strategy,
    amount_sol: d.amount_sol,
    min_bin: res.bin_range.min,
    max_bin: res.bin_range.max,
    opened_at: new Date().toISOString(),
    alerted: false,
  });
  resetSession();
  const txs = (res.txs || []).map((t) => solscanTx(t)).join("\n");
  await sendMessage([
    "✅ DEPLOY SUKSES",
    `Pool: ${res.pool_name || d.pool.name}`,
    `Posisi: ${res.position}`,
    `Bins: ${res.bin_range.min} → ${res.bin_range.max} (aktif ${res.bin_range.active})`,
    `Harga: ${fmtNum(res.price_range.min, 8)} → ${fmtNum(res.price_range.max, 8)}`,
    txs ? `Tx:\n${txs}` : null,
  ].filter(Boolean).join("\n"));
  return mainMenu();
}

export function registerDeployFlow({ commandHandlers, callbackHandlers, mainMenu }) {
  commandHandlers["/deploy"] = () => askMint(null);
  callbackHandlers.push(
    { prefix: "dep", fn: (msg) => askMint(msg.messageId) },
    { prefix: "dep:pool", fn: onPool },
    { prefix: "dep:strat", fn: onStrategy },
    { prefix: "dep:amt", fn: onAmount },
    { prefix: "dep:rng", fn: onRange },
    { prefix: "dep:go", fn: (msg, arg) => onConfirm(msg, arg, mainMenu) },
  );
}
