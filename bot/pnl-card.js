// PnL close card — background win.png (profit) / lose.png (loss) milik user,
// panel data digambar di atasnya. Pola renderer diangkat dari card-renderer.js repo agent.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

let _fontReady = false;
function ensureFonts() {
  if (_fontReady) return;
  const p = path.join(ROOT, "fonts", "Oxanium-VariableFont.ttf");
  try { if (fs.existsSync(p)) GlobalFonts.registerFromPath(p, "Oxanium"); } catch {}
  _fontReady = true;
}
const FONT = "Oxanium, 'Segoe UI', sans-serif";

const W = 1200, H = 675;
const GREEN = "#20C997";
const RED = "#FF4D6D";

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// cover-fit: isi penuh canvas tanpa distorsi (crop sisi berlebih)
function drawCover(ctx, img) {
  const scale = Math.max(W / img.width, H / img.height);
  const dw = img.width * scale, dh = img.height * scale;
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

/**
 * renderPnlCard({ win, pair, strategy, pnlUsd, pnlPct, durationText, closedAt })
 * -> Buffer PNG. Throw kalau background tidak ada / render gagal (caller fallback ke teks).
 */
export async function renderPnlCard({ win, pair, strategy, pnlUsd, pnlPct, durationText, closedAt }) {
  ensureFonts();
  const bgPath = path.join(ROOT, win ? "win.png" : "lose.png");
  const img = await loadImage(bgPath);

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  drawCover(ctx, img);

  // scrim tipis global agar teks kontras
  ctx.fillStyle = "rgba(6,6,12,0.18)";
  ctx.fillRect(0, 0, W, H);

  // panel data kiri-atas
  const px = 42, py = 42, pw = 520, ph = 330;
  roundRect(ctx, px, py, pw, ph, 22);
  ctx.fillStyle = "rgba(10,10,18,0.78)";
  ctx.fill();
  ctx.strokeStyle = win ? "rgba(32,201,151,0.55)" : "rgba(255,77,109,0.55)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const color = win ? GREEN : RED;
  const sign = Number(pnlUsd) >= 0 ? "+" : "-";
  let y = py + 56;

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#9AA0B4";
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText("PUREXBT — MANUAL DLMM", px + 32, y);

  y += 52;
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText(String(pair || "?").slice(0, 20), px + 32, y);

  y += 78;
  ctx.fillStyle = color;
  ctx.font = `800 64px ${FONT}`;
  ctx.fillText(`${sign}$${Math.abs(Number(pnlUsd) || 0).toFixed(2)}`, px + 32, y);

  y += 48;
  ctx.font = `700 32px ${FONT}`;
  ctx.fillText(`${Number(pnlPct) >= 0 ? "+" : ""}${(Number(pnlPct) || 0).toFixed(2)}%`, px + 32, y);

  y += 52;
  ctx.fillStyle = "#C9CDDC";
  ctx.font = `600 24px ${FONT}`;
  const detail = [strategy || null, durationText ? `Durasi ${durationText}` : null].filter(Boolean).join("   •   ");
  if (detail) ctx.fillText(detail, px + 32, y);

  // status besar kanan-bawah + timestamp
  ctx.fillStyle = color;
  ctx.font = `800 54px ${FONT}`;
  const label = win ? "PROFIT" : "LOSS";
  const lw = ctx.measureText(label).width;
  ctx.fillText(label, W - lw - 48, H - 88);

  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = `600 20px ${FONT}`;
  const ts = closedAt || new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const tw = ctx.measureText(ts).width;
  ctx.fillText(ts, W - tw - 48, H - 44);

  return canvas.toBuffer("image/png");
}

// durasi "3j 12m" dari ISO opened_at; null kalau tidak diketahui
export function durationSince(openedAtIso) {
  if (!openedAtIso) return null;
  const ms = Date.now() - new Date(openedAtIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}h ${h % 24}j`;
  if (h > 0) return `${h}j ${m % 60}m`;
  return `${m}m`;
}
