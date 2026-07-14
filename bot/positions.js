import { sendMessage, sendMessageWithButtons, editMessageWithButtons } from "../telegram.js";
import { claimFees, closePosition } from "../engine/dlmm.js";
import { computePositions } from "../engine/pnl.js";
import { getWallet, getWalletBalances, swapToken } from "../engine/wallet.js";
import { loadPositions, removePosition } from "../store.js";
import { getSession, resetSession } from "./session.js";
import config from "../config.js";
import { fmtNum, fmtUsd, shortAddr, solscanTx, strategyLabel } from "./format.js";
import { log } from "../logger.js";

const MENU_ROW = [{ text: "⬅️ Menu", callback_data: "menu" }];

// Gabung PnL on-chain dengan store lokal. PnL (on-chain) adalah sumber kebenaran
// daftar posisi; store menambah nama/strategi untuk posisi yang dibuka bot ini.
async function buildPositionList() {
  const wallet = getWallet().publicKey.toString();
  const pnl = await computePositions(wallet);
  const stored = loadPositions();
  return (pnl.positions || []).map((p) => {
    const meta = stored.find((s) => s.position === p.position) || {};
    return { ...meta, ...p };
  });
}

function positionName(p) {
  return p.pool_name || p.pair || shortAddr(p.pool);
}

function positionLine(p, i) {
  const inRange = p.in_range == null ? "?" : p.in_range ? "🟢 in-range" : "🔴 OUT OF RANGE";
  return [
    `${i + 1}. ${positionName(p)}${p.strategy ? ` [${strategyLabel(p.strategy)}]` : ""}`,
    `   Nilai: ${fmtUsd(p.total_value_usd)} | PnL: ${fmtUsd(p.pnl_usd)} (${fmtNum(p.pnl_pct, 2)}%)`,
    `   Fees: ${fmtUsd(p.unclaimed_fees_usd)} | ${inRange}`,
  ].join("\n");
}

async function showPositions(messageId = null) {
  const list = await buildPositionList();
  const s = getSession();
  s.data.posList = list; // index dipakai callback claim/exit
  if (!list.length) {
    const text = "Tidak ada posisi terbuka.";
    if (messageId) return editMessageWithButtons(text, messageId, [MENU_ROW]);
    return sendMessageWithButtons(text, [MENU_ROW]);
  }
  const text = ["📊 Posisi terbuka:", ...list.map(positionLine)].join("\n\n");
  const rows = list.map((p, i) => [
    { text: `💸 Claim ${i + 1}`, callback_data: `pos:claim:${i}` },
    { text: `🚪 Exit ${i + 1}`, callback_data: `pos:exit:${i}` },
  ]);
  rows.push(MENU_ROW);
  if (messageId) return editMessageWithButtons(text, messageId, rows);
  return sendMessageWithButtons(text, rows);
}

function getPos(i) {
  return getSession().data.posList?.[Number(i)];
}

async function confirmClaim(msg, i) {
  const p = getPos(i);
  if (!p) return sendMessage("Daftar kadaluarsa — buka 📊 Positions lagi.");
  return editMessageWithButtons(
    `Claim fees ${positionName(p)}?\nUnclaimed: ${fmtUsd(p.unclaimed_fees_usd)}`,
    msg.messageId,
    [[{ text: "✅ Claim", callback_data: `pos:claim:go:${i}` }, { text: "❌ Batal", callback_data: "pos" }]],
  );
}

async function doClaim(msg, i) {
  const p = getPos(i);
  if (!p) return sendMessage("Daftar kadaluarsa — buka 📊 Positions lagi.");
  await editMessageWithButtons("⏳ Claiming fees…", msg.messageId, []);
  const res = await claimFees({ position_address: p.position, pool_address: p.pool });
  if (!res.success) return sendMessageWithButtons(`❌ Claim gagal: ${res.error}`, [MENU_ROW]);
  const txs = (res.txs || []).map(solscanTx).join("\n");
  return sendMessageWithButtons(`✅ Fees ${positionName(p)} diklaim.\n${txs}`, [MENU_ROW]);
}

async function confirmExit(msg, i) {
  const p = getPos(i);
  if (!p) return sendMessage("Daftar kadaluarsa — buka 📊 Positions lagi.");
  return editMessageWithButtons(
    [
      `⚠️ EXIT ${positionName(p)}?`,
      `Nilai: ${fmtUsd(p.total_value_usd)} | PnL: ${fmtUsd(p.pnl_usd)} (${fmtNum(p.pnl_pct, 2)}%)`,
      "Remove liquidity 100% + claim fees + close, lalu auto-swap token ke SOL.",
    ].join("\n"),
    msg.messageId,
    [[{ text: "✅ Exit", callback_data: `pos:exit:go:${i}` }, { text: "❌ Batal", callback_data: "pos" }]],
  );
}

// Swap semua token non-SOL/non-USDC bernilai >= $0.50 ke SOL.
async function sweepToSol() {
  const results = [];
  const bal = await getWalletBalances({ force: true });
  const skip = new Set([config.tokens.sol, config.tokens.usdc]);
  for (const t of bal.tokens || []) {
    const usd = Number(t.usd ?? 0);
    if (skip.has(t.mint) || !Number.isFinite(usd) || usd < 0.5) continue;
    try {
      const r = await swapToken({ input_mint: t.mint, output_mint: config.tokens.sol, amount: t.balance });
      if (r?.success) {
        results.push(`↩️ ${t.symbol || shortAddr(t.mint)} → SOL (${solscanTx(r.tx)})`);
      } else {
        results.push(`⚠️ Gagal swap ${t.symbol || shortAddr(t.mint)}: ${r?.error || "unknown"}`);
      }
    } catch (e) {
      log("sweep_error", `${t.mint}: ${e.message}`);
      results.push(`⚠️ Gagal swap ${t.symbol || shortAddr(t.mint)}: ${e.message}`);
    }
  }
  return results;
}

async function doExit(msg, i) {
  const p = getPos(i);
  if (!p) return sendMessage("Daftar kadaluarsa — buka 📊 Positions lagi.");
  await editMessageWithButtons("⏳ Closing position…", msg.messageId, []);
  const res = await closePosition({ position_address: p.position, pool_address: p.pool });
  if (!res.success) return sendMessageWithButtons(`❌ Exit gagal: ${res.error}`, [MENU_ROW]);
  removePosition(p.position);
  await sendMessage("Posisi ditutup. ⏳ Auto-swap token ke SOL…");
  const sweep = await sweepToSol();
  resetSession();
  const txs = [...(res.claim_txs || []), ...(res.close_txs || [])].map(solscanTx).join("\n");
  return sendMessageWithButtons([
    "✅ EXIT SELESAI",
    `Posisi: ${shortAddr(p.position)} (${positionName(p)})${res.already_closed ? " — sudah tertutup on-chain" : ""}`,
    txs ? `Tx:\n${txs}` : null,
    sweep.length ? sweep.join("\n") : "Tidak ada token yang perlu di-swap.",
  ].filter(Boolean).join("\n"), [MENU_ROW]);
}

export function registerPositionsFlow({ commandHandlers, callbackHandlers }) {
  commandHandlers["/positions"] = () => showPositions();
  callbackHandlers.push(
    { prefix: "pos", fn: (msg) => showPositions(msg.messageId) },
    { prefix: "pos:claim", fn: confirmClaim },
    { prefix: "pos:claim:go", fn: doClaim },
    { prefix: "pos:exit", fn: confirmExit },
    { prefix: "pos:exit:go", fn: doExit },
  );
}
