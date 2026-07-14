// Telegram layer — diangkat dari repo agent: long polling, inline keyboard,
// callback query, edit message, auth ketat per chat id. Notifikasi agent dibuang.
import { log } from "./logger.js";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || null;
const BASE  = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : null;
const ALLOWED_USER_IDS = new Set(
  String(process.env.TELEGRAM_ALLOWED_USER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
);

const chatId = process.env.TELEGRAM_CHAT_ID || null;
let _offset  = 0;
let _polling = false;
let _warnedMissingChatId = false;
let _warnedMissingAllowedUsers = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isAuthorizedIncomingMessage(msg) {
  const incomingChatId = String(msg.chat?.id || "");
  const senderUserId = msg.from?.id != null ? String(msg.from.id) : null;
  const chatType = msg.chat?.type || "unknown";

  if (!chatId) {
    if (!_warnedMissingChatId) {
      log("telegram_warn", "Ignoring inbound Telegram messages because TELEGRAM_CHAT_ID is not configured. Auto-registration is disabled for safety.");
      _warnedMissingChatId = true;
    }
    return false;
  }

  if (incomingChatId !== chatId) return false;

  if (chatType !== "private" && ALLOWED_USER_IDS.size === 0) {
    if (!_warnedMissingAllowedUsers) {
      log("telegram_warn", "Ignoring group Telegram messages because TELEGRAM_ALLOWED_USER_IDS is not configured. Set explicit allowed user IDs for command/control.");
      _warnedMissingAllowedUsers = true;
    }
    return false;
  }

  if (ALLOWED_USER_IDS.size > 0) {
    if (!senderUserId || !ALLOWED_USER_IDS.has(senderUserId)) return false;
  }

  return true;
}

// ─── Core send ───────────────────────────────────────────────────
export function isEnabled() {
  return !!TOKEN;
}

/* Kirim dgn retry 2x (backoff 2s/5s) — kedipan jaringan bikin pesan hilang permanen.
   Retry HANYA network error / 5xx / 429; 4xx lain = permanen, jangan diulang. */
async function fetchTgRetry(url, opts, tag) {
  const delays = [2000, 5000];
  for (let att = 0; ; att++) {
    try {
      const res = await fetch(url, opts);
      if (res.ok || (res.status < 500 && res.status !== 429) || att >= delays.length) return res;
      log("telegram_warn", `${tag} HTTP ${res.status} — retry ${att + 1}/${delays.length}`);
    } catch (e) {
      if (att >= delays.length) throw e;
      log("telegram_warn", `${tag} ${e.message} — retry ${att + 1}/${delays.length}`);
    }
    await sleep(delays[att]);
  }
}

async function postTelegram(method, body) {
  if (!TOKEN || !chatId) return null;
  try {
    const res = await fetchTgRetry(`${BASE}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, ...body }),
    }, method);
    if (!res.ok) {
      const err = await res.text();
      log("telegram_error", `${method} ${res.status}: ${err.slice(0, 200)}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    log("telegram_error", `${method} failed: ${e.message}`);
    return null;
  }
}

async function postTelegramRaw(method, body) {
  if (!TOKEN) return null;
  try {
    const res = await fetchTgRetry(`${BASE}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, method);
    if (!res.ok) {
      const err = await res.text();
      log("telegram_error", `${method} ${res.status}: ${err.slice(0, 200)}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    log("telegram_error", `${method} failed: ${e.message}`);
    return null;
  }
}

export async function sendMessage(text) {
  if (!TOKEN || !chatId) return;
  return postTelegram("sendMessage", { text: String(text).slice(0, 4096) });
}

export async function sendMessageWithButtons(text, inlineKeyboard) {
  if (!TOKEN || !chatId) return;
  return postTelegram("sendMessage", {
    text: String(text).slice(0, 4096),
    reply_markup: { inline_keyboard: inlineKeyboard },
  });
}

// Track last-edited content to skip Telegram "message is not modified" 400 errors
const _lastEdits = new Map();

export async function editMessage(text, messageId) {
  if (!TOKEN || !chatId || !messageId) return null;
  const t = String(text).slice(0, 4096);
  const key = `${messageId}`;
  if (_lastEdits.get(key) === t) return null;  // skip — content unchanged
  _lastEdits.set(key, t);
  return postTelegram("editMessageText", {
    message_id: messageId,
    text: t,
  });
}

export async function editMessageWithButtons(text, messageId, inlineKeyboard) {
  if (!TOKEN || !chatId || !messageId) return null;
  const t = String(text).slice(0, 4096);
  const key = `${messageId}_btn`;
  if (_lastEdits.get(key) === t) return null;  // skip — content unchanged
  _lastEdits.set(key, t);
  return postTelegram("editMessageText", {
    message_id: messageId,
    text: t,
    reply_markup: { inline_keyboard: inlineKeyboard },
  });
}

export async function sendPhoto(pngBuffer, caption = "") {
  if (!TOKEN || !chatId || !pngBuffer) return null;
  try {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    if (caption) form.append("caption", String(caption).slice(0, 1024));
    form.append("photo", new Blob([pngBuffer], { type: "image/png" }), "pnl-card.png");
    const res = await fetchTgRetry(`${BASE}/sendPhoto`, { method: "POST", body: form }, "sendPhoto");
    if (!res.ok) {
      const err = await res.text();
      log("telegram_error", `sendPhoto ${res.status}: ${err.slice(0, 200)}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    log("telegram_error", `sendPhoto failed: ${e.message}`);
    return null;
  }
}

export async function answerCallbackQuery(callbackQueryId, text = "") {
  if (!TOKEN || !callbackQueryId) return null;
  return postTelegramRaw("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text: String(text).slice(0, 200) } : {}),
  });
}

// ─── Long polling ────────────────────────────────────────────────
async function poll(onMessage) {
  while (_polling) {
    try {
      const res = await fetch(
        `${BASE}/getUpdates?offset=${_offset}&timeout=30`,
        { signal: AbortSignal.timeout(35_000) }
      );
      if (!res.ok) { await sleep(5000); continue; }
      const data = await res.json();
      for (const update of data.result || []) {
        _offset = update.update_id + 1;
        const callback = update.callback_query;
        if (callback?.data && callback?.message) {
          const callbackMsg = {
            chat: callback.message.chat,
            from: callback.from,
            text: callback.data,
          };
          if (!isAuthorizedIncomingMessage(callbackMsg)) continue;
          await onMessage({
            ...callbackMsg,
            isCallback: true,
            callbackQueryId: callback.id,
            callbackData: callback.data,
            messageId: callback.message.message_id,
          });
          continue;
        }
        const msg = update.message;
        if (!msg?.text) continue;
        if (!isAuthorizedIncomingMessage(msg)) continue;
        await onMessage(msg);
      }
    } catch (e) {
      if (!e.message?.includes("aborted")) {
        log("telegram_error", `Poll error: ${e.message}`);
      }
      await sleep(5000);
    }
  }
}

export function startPolling(onMessage) {
  if (!TOKEN) return;
  _polling = true;
  poll(onMessage); // fire-and-forget
  log("telegram", "Bot polling started");
}

export function stopPolling() {
  _polling = false;
}
