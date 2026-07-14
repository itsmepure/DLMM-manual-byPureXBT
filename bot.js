import "dotenv/config";
import { log } from "./logger.js";
import {
  startPolling, sendMessage, sendMessageWithButtons,
  editMessageWithButtons, answerCallbackQuery,
} from "./telegram.js";
import { getSession, resetSession } from "./bot/session.js";
import { getWalletBalances } from "./engine/wallet.js";
import { fmtNum, fmtUsd, shortAddr } from "./bot/format.js";
import { registerDeployFlow } from "./bot/deploy.js";

// ─── Env guard ───────────────────────────────────────────────────
for (const key of ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "WALLET_PRIVATE_KEY", "RPC_URL"]) {
  if (!process.env[key]) {
    console.error(`Missing required env: ${key} (lihat .env.example)`);
    process.exit(1);
  }
}

// ─── Menu ────────────────────────────────────────────────────────
const MENU_BUTTONS = [
  [{ text: "🚀 Deploy", callback_data: "dep" }, { text: "📊 Positions", callback_data: "pos" }],
  [{ text: "💰 Balance", callback_data: "bal" }, { text: "⚙️ Settings", callback_data: "set" }],
];

export async function mainMenu(messageId = null) {
  resetSession();
  const text = "Manual DLMM Bot — pilih aksi:";
  if (messageId) return editMessageWithButtons(text, messageId, MENU_BUTTONS);
  return sendMessageWithButtons(text, MENU_BUTTONS);
}

async function showBalance(messageId = null) {
  const b = await getWalletBalances({});
  const tokens = (b.tokens || [])
    .filter((t) => (t.usd ?? 0) >= 0.01)
    .map((t) => `  ${t.symbol || shortAddr(t.mint)}: ${fmtNum(t.balance)} (${fmtUsd(t.usd ?? 0)})`)
    .join("\n");
  const text = [
    `💰 Wallet ${shortAddr(b.wallet)}`,
    `SOL: ${fmtNum(b.sol)} (${fmtUsd(b.sol_usd)})`,
    `USDC: ${fmtNum(b.usdc)}`,
    tokens ? `Tokens:\n${tokens}` : null,
    `Total: ${fmtUsd(b.total_usd)}`,
    b.error ? `⚠️ ${b.error}` : null,
  ].filter(Boolean).join("\n");
  const buttons = [[{ text: "⬅️ Menu", callback_data: "menu" }]];
  if (messageId) return editMessageWithButtons(text, messageId, buttons);
  return sendMessageWithButtons(text, buttons);
}

// ─── Router ──────────────────────────────────────────────────────
// Flow modules (deploy/positions/settings) mendaftarkan handler di kedua registry ini.
export const commandHandlers = {
  "/start": () => mainMenu(),
  "/menu": () => mainMenu(),
  "/balance": () => showBalance(),
  "/cancel": async () => { resetSession(); await sendMessage("Dibatalkan."); return mainMenu(); },
};

export const callbackHandlers = [
  { prefix: "menu", fn: (msg) => mainMenu(msg.messageId) },
  { prefix: "bal", fn: (msg) => showBalance(msg.messageId) },
  { prefix: "cancel", fn: async (msg) => { resetSession(); return mainMenu(msg.messageId); } },
];

registerDeployFlow({ commandHandlers, callbackHandlers, mainMenu });

async function onMessage(msg) {
  try {
    if (msg.isCallback) {
      await answerCallbackQuery(msg.callbackQueryId);
      const data = msg.callbackData;
      // longest-prefix match agar "pos:exit" tidak tertangkap "pos"
      const match = callbackHandlers
        .filter((h) => data === h.prefix || data.startsWith(h.prefix + ":"))
        .sort((a, b) => b.prefix.length - a.prefix.length)[0];
      if (match) {
        const arg = data === match.prefix ? null : data.slice(match.prefix.length + 1);
        await match.fn(msg, arg);
      }
      return;
    }
    const text = (msg.text || "").trim();
    const cmd = text.split(/\s+/)[0].toLowerCase();
    if (commandHandlers[cmd]) return await commandHandlers[cmd](msg);
    const session = getSession();
    if (session.awaitingText) {
      const handler = session.awaitingText;
      session.awaitingText = null;
      return await handler(text);
    }
    return await mainMenu();
  } catch (e) {
    log("bot_error", e.stack || e.message);
    await sendMessage(`⚠️ Error: ${e.message}`).catch(() => null);
  }
}

// ─── Start ───────────────────────────────────────────────────────
log("bot", "Manual DLMM bot starting…");
startPolling(onMessage);
await sendMessage("🤖 Manual DLMM bot online. /menu untuk mulai.");
