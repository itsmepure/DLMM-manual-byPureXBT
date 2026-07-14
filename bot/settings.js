import { sendMessage, sendMessageWithButtons, editMessageWithButtons } from "../telegram.js";
import { loadSettings, saveSettings } from "../store.js";
import { getSession } from "./session.js";

const MENU_ROW = [{ text: "⬅️ Menu", callback_data: "menu" }];

function settingsText() {
  const s = loadSettings();
  return [
    "⚙️ Settings",
    `Amount presets: ${s.amountPresets.join(", ")} SOL`,
    `Range presets: ${s.rangePresets.map((r) => `-${r.down}%/+${r.up}%`).join(", ")}`,
  ].join("\n");
}

const SETTINGS_BUTTONS = [
  [{ text: "✏️ Amount presets", callback_data: "set:amt" },
   { text: "✏️ Range presets", callback_data: "set:rng" }],
  MENU_ROW,
];

async function showSettings(messageId = null) {
  if (messageId) return editMessageWithButtons(settingsText(), messageId, SETTINGS_BUTTONS);
  return sendMessageWithButtons(settingsText(), SETTINGS_BUTTONS);
}

async function editAmounts() {
  getSession().awaitingText = async (text) => {
    const nums = text.trim().split(/\s+/).map((x) => Number(x.replace(",", ".")));
    if (!nums.length || nums.some((n) => !Number.isFinite(n) || n <= 0)) {
      return sendMessageWithButtons("Input tidak valid — tidak ada yang diubah.", [MENU_ROW]);
    }
    const s = loadSettings();
    s.amountPresets = nums.slice(0, 4);
    saveSettings(s);
    return showSettings();
  };
  return sendMessage("Ketik preset amount baru, angka SOL dipisah spasi (maks 4), mis: 0.5 1 2");
}

async function editRanges() {
  getSession().awaitingText = async (text) => {
    const pairs = text.trim().split(/\s+/).map((p) => {
      const m = p.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
      return m ? { down: Number(m[1]), up: Number(m[2]) } : null;
    });
    if (!pairs.length || pairs.some((p) => !p || p.down <= 0 || p.down >= 100)) {
      return sendMessageWithButtons("Input tidak valid — tidak ada yang diubah.", [MENU_ROW]);
    }
    const s = loadSettings();
    s.rangePresets = pairs.slice(0, 4);
    saveSettings(s);
    return showSettings();
  };
  return sendMessage("Ketik preset range baru, format down/up dipisah spasi (maks 4), mis: 5/3 10/3 20/3");
}

export function registerSettingsFlow({ commandHandlers, callbackHandlers }) {
  commandHandlers["/settings"] = () => showSettings();
  callbackHandlers.push(
    { prefix: "set", fn: (msg) => showSettings(msg.messageId) },
    { prefix: "set:amt", fn: editAmounts },
    { prefix: "set:rng", fn: editRanges },
  );
}
