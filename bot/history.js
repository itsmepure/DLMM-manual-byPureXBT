import { sendMessageWithButtons, editMessageWithButtons } from "../telegram.js";
import { loadHistory } from "../store.js";
import { fmtNum, fmtUsd, strategyLabel } from "./format.js";

const MENU_ROW = [{ text: "⬅️ Menu", callback_data: "menu" }];

function durationBetween(openedAt, closedAt) {
  if (!openedAt || !closedAt) return null;
  const ms = new Date(closedAt).getTime() - new Date(openedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}h ${h % 24}j`;
  if (h > 0) return `${h}j ${m % 60}m`;
  return `${m}m`;
}

function historyLine(e, i) {
  const win = Number(e.pnl_usd) >= 0;
  const when = e.closed_at ? e.closed_at.slice(0, 16).replace("T", " ") : "?";
  const dur = durationBetween(e.opened_at, e.closed_at);
  return [
    `${i + 1}. ${win ? "🟢" : "🔴"} ${e.pool_name}${e.strategy ? ` [${strategyLabel(e.strategy)}]` : ""}`,
    `   PnL: ${fmtUsd(e.pnl_usd)} (${Number(e.pnl_pct) >= 0 ? "+" : ""}${fmtNum(e.pnl_pct, 2)}%)${e.amount_sol ? ` | ${e.amount_sol} SOL` : ""}`,
    `   ${when} UTC${dur ? ` | durasi ${dur}` : ""}`,
  ].join("\n");
}

async function showHistory(messageId = null) {
  const all = loadHistory();
  const REFRESH_ROW = [{ text: "🔄 Refresh", callback_data: "hist" }, ...MENU_ROW];
  if (!all.length) {
    const text = "Belum ada riwayat posisi ditutup.";
    if (messageId) return editMessageWithButtons(text, messageId, [REFRESH_ROW]);
    return sendMessageWithButtons(text, [REFRESH_ROW]);
  }
  const recent = all.slice(-10).reverse(); // 10 terakhir, terbaru dulu
  const totalPnl = all.reduce((s, e) => s + (Number(e.pnl_usd) || 0), 0);
  const wins = all.filter((e) => Number(e.pnl_usd) >= 0).length;
  const header =
    `📜 History (${all.length} posisi | ${wins}W/${all.length - wins}L)\n` +
    `Total PnL: ${fmtUsd(totalPnl)}`;
  const text = [header, ...recent.map(historyLine)].join("\n\n");
  if (messageId) return editMessageWithButtons(text, messageId, [REFRESH_ROW]);
  return sendMessageWithButtons(text, [REFRESH_ROW]);
}

export function registerHistoryFlow({ commandHandlers, callbackHandlers }) {
  commandHandlers["/history"] = () => showHistory();
  callbackHandlers.push({ prefix: "hist", fn: (msg) => showHistory(msg.messageId) });
}
