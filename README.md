# DLMM Manual — by PureXBT

Bot Telegram **manual** untuk liquidity providing di [Meteora DLMM](https://app.meteora.ag/) (Solana). Tidak ada AI, tidak ada aksi otomatis — **Anda yang menekan tombolnya**, bot yang mengeksekusi on-chain.

Engine diangkat dari agent autonomous [PureXBT-Pool-pureXBT-dlmm-agent](https://github.com/itsmepure/PureXBT-Pool-pureXBT-dlmm-agent-), dipangkas dari seluruh logika AI/screening/auto-management.

## Fitur

| Fitur | Keterangan |
|---|---|
| 🚀 **Deploy** | Paste CA/mint token → pilih pool → pilih strategi **Spot / Bid-Ask / Curve** → amount → range → konfirmasi. Single-sided SOL. |
| 🔍 **Auto-detect CA** | Paste mint token kapan saja di chat — bot langsung mencari pool DLMM-nya. |
| 🚪 **Exit** | Remove liquidity 100% + claim fees + close dalam satu tombol, lalu **auto-swap** token hasil ke SOL via Jupiter. |
| 🖼️ **PnL Card** | Setiap close dapat kartu PnL bergambar — `win.png` saat profit, `lose.png` saat loss. |
| 💸 **Claim fees** | Claim per posisi tanpa harus close. |
| 📊 **Positions** | Daftar posisi dengan PnL on-chain, nilai, unclaimed fees, status in/out-range, tombol 🔄 Refresh. |
| 💰 **Balance** | Saldo SOL/USDC/token wallet (Helius, fallback RPC murni). |
| ⚙️ **Settings** | Preset amount & range bisa diedit langsung dari Telegram. |
| 🔔 **Alert out-of-range** | Notifikasi saat posisi keluar range (cek tiap 2 menit). Hanya notifikasi — tidak ada auto-close. |

## Setup

Butuh **Node.js ≥ 18**.

```bash
git clone https://github.com/itsmepure/DLMM-manual-byPureXBT.git
cd DLMM-manual-byPureXBT
npm install        # postinstall menjalankan patch ESM untuk @meteora-ag/dlmm@1.9.4 (wajib, jangan dilewati)
cp .env.example .env   # Windows: copy .env.example .env
```

Isi `.env`:

| Variabel | Wajib | Keterangan |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | Buat bot di [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | ✅ | Chat id Anda (cek via [@userinfobot](https://t.me/userinfobot)). Bot **hanya** merespons chat ini. |
| `WALLET_PRIVATE_KEY` | ✅ | Secret key base58 wallet Solana |
| `RPC_URL` | ✅ | RPC mainnet — disarankan RPC privat (Helius/Triton/dll) |
| `HELIUS_API_KEY` | opsional | Tampilan balance lengkap + auto-swap butuh ini (ada fallback RPC untuk SOL/USDC) |
| `JUPITER_API_KEY` | opsional | API key Jupiter untuk swap |

## Menjalankan

```bash
npm start
```

Kirim `/start` ke bot Anda di Telegram. Semua interaksi lewat tombol; command tersedia sebagai jalan pintas: `/menu` `/deploy` `/positions` `/balance` `/settings` `/cancel`.

Untuk jalan 24/7: `pm2 start bot.js --name dlmm-bot` (atau NSSM / Task Scheduler di Windows).

Verifikasi tanpa transaksi:

```bash
npm test         # unit tests
npm run smoke    # read-only: search pool + baca active bin dari mainnet
```

## Alur deploy

1. Paste **CA/mint token** (atau tekan 🚀 Deploy dulu)
2. Pilih pool — tombol menampilkan `nama | bin step | fee | TVL`
3. Pilih strategi: **Spot** (rata), **Bid-Ask** (menumpuk di tepi), **Curve** (menumpuk di tengah)
4. Pilih amount SOL (preset atau ketik manual)
5. Pilih range (preset persen downside, atau ketik `bins_below bins_above` manual)
6. Layar konfirmasi menampilkan harga aktif + cek saldo → ✅ Deploy

Guard bawaan engine:
- **Single-sided SOL** — deposit hanya sisi SOL di bawah harga aktif
- Menolak range yang butuh **inisialisasi bin-array baru** (rent non-refundable ~0.07 SOL/array)
- Slippage 10%; path khusus untuk range lebar >69 bins (extended position + add liquidity chunked)

## Struktur

```
bot.js            entry: router, menu, balance, alert loop
bot/              deploy flow, positions/claim/exit, settings, PnL card, formatter
engine/dlmm.js    deploy / claim / close / active bin / search pools (Meteora SDK)
engine/wallet.js  keypair, balances, swap Jupiter v2
engine/pnl.js     PnL on-chain (getAllLbPairPositionsByUser)
telegram.js       long polling, inline keyboard, sendPhoto
store.js          positions.json & settings.json (atomic write)
scripts/patch-anchor.js   patch ESM @meteora-ag/dlmm@1.9.4 (postinstall)
```

## Keamanan

- **Jangan pernah commit `.env`** — sudah di `.gitignore`. Private key hanya hidup di mesin Anda.
- Bot mengabaikan semua chat selain `TELEGRAM_CHAT_ID` (auto-register dimatikan).
- Setiap aksi on-chain (deploy/claim/exit) wajib melewati tombol konfirmasi eksplisit.
- Untuk grup: set `TELEGRAM_ALLOWED_USER_IDS` (comma-separated user id).

## Disclaimer

LP di DLMM berisiko: impermanent loss, token dump, posisi out-of-range. Gunakan dana yang siap Anda pertaruhkan. Software disediakan as-is tanpa jaminan apa pun. DYOR.
