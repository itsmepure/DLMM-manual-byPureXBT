// Trimmed config for the manual bot. Source of truth: env (.env).
import "dotenv/config";

// Bot manual: user selalu konfirmasi sendiri, jadi floor range praktis dimatikan.
// (Di agent autonomous asalnya 35 untuk mencegah AI deploy range sempit.)
export const MIN_SAFE_BINS_BELOW = 1;

export const config = {
  tokens: {
    sol: "So11111111111111111111111111111111111111112",
    usdc: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    // alias uppercase — engine/wallet.js hasil salinan membaca config.tokens.SOL/USDC
    SOL: "So11111111111111111111111111111111111111112",
    USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  },
  jupiter: {
    apiKey: process.env.JUPITER_API_KEY || null,
    referralAccount: null,
    referralFeeBps: 0,
  },
  pnl: {
    rpcUrl: process.env.RPC_URL,
    source: "rpc",
  },
  strategy: {
    strategy: "spot",        // default kalau user tidak memilih (bot SELALU memilihkan eksplisit)
    defaultBinsBelow: 40,
  },
  management: {
    deployUpsidePct: 3,      // headroom bins kosong di atas harga aktif (single-side SOL)
    gasReserve: 0.05,        // SOL disisakan untuk fee
  },
};

export default config;
