export function shortAddr(a) {
  if (!a || a.length < 9) return String(a || "");
  return `${a.slice(0, 4)}..${a.slice(-4)}`;
}

export function fmtNum(n, dp = 4) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "-";
  return String(Number(v.toFixed(dp)));
}

export function fmtUsd(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "-";
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const solscanTx = (sig) => `https://solscan.io/tx/${sig}`;
export const solscanAccount = (addr) => `https://solscan.io/account/${addr}`;

const STRATEGY_LABELS = { spot: "Spot", bid_ask: "Bid-Ask", curve: "Curve" };
export const strategyLabel = (s) => STRATEGY_LABELS[s] || s;
