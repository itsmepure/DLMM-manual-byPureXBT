# Manual DLMM Telegram Bot

Bot Telegram **manual** untuk LP di Meteora DLMM (Solana). Anda yang memutuskan semua aksi — bot hanya mengeksekusi:

- 🚀 **Deploy** posisi liquidity single-sided SOL dengan strategi **Spot / Bid-Ask / Curve**
- 🚪 **Exit**: remove liquidity 100% + claim fees + close, lalu auto-swap token hasil ke SOL via Jupiter
- 💸 **Claim fees** per posisi tanpa close
- 📊 **Positions**: daftar posisi dengan PnL on-chain, nilai, unclaimed fees, status range
- 💰 **Balance** wallet
- ⚙️ **Settings**: preset amount & range yang bisa diedit dari Telegram
- 🔔 **Alert out-of-range**: notifikasi saat posisi keluar range (hanya notifikasi — tidak ada aksi otomatis)

Engine on-chain diangkat dari repo agent autonomous [PureXBT-Pool-pureXBT-dlmm-agent](https://github.com/itsmepure/PureXBT-Pool-pureXBT-dlmm-agent-), dipangkas dari semua logika AI/autonomous.

## Setup

```bash
npm install          # postinstall menjalankan patch ESM untuk @meteora-ag/dlmm@1.9.4 (wajib)
copy .env.example .env
```

Isi `.env`:

| Variabel | Wajib | Keterangan |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | Token dari @BotFather |
| `TELEGRAM_CHAT_ID` | ✅ | Chat id Anda — bot HANYA merespons chat ini |
| `WALLET_PRIVATE_KEY` | ✅ | Secret key base58 wallet Solana |
| `RPC_URL` | ✅ | RPC mainnet (disarankan Helius/privat) |
| `HELIUS_API_KEY` | opsional | Untuk tampilan balance lengkap (ada fallback RPC) |
| `JUPITER_API_KEY` | opsional | Untuk swap Jupiter dengan API key |

## Menjalankan

```bash
npm start
```

Di Telegram kirim `/start`. Command: `/menu` `/deploy` `/positions` `/balance` `/settings` `/cancel`.

Untuk jalan 24/7 gunakan pm2 (`pm2 start bot.js --name dlmm-bot`) atau NSSM/Task Scheduler di Windows.

Smoke test read-only (tanpa transaksi): `npm run smoke`. Unit test: `npm test`.

## Alur deploy

1. Tombol 🚀 Deploy → paste **token mint address**
2. Pilih pool dari daftar (nama | bin step | fee | TVL)
3. Pilih strategi: Spot / Bid-Ask / Curve
4. Pilih amount (preset atau ketik manual)
5. Pilih range (preset persen atau ketik bin manual)
6. Layar konfirmasi (cek saldo + harga aktif) → ✅ Deploy

Guard bawaan engine: minimum total 35 bins, tolak range yang butuh inisialisasi bin-array baru (rent non-refundable), single-sided SOL saja, slippage 10%.

## Keamanan

- Private key hanya di `.env` (gitignored). Jangan commit / bagikan.
- Bot mengabaikan semua chat selain `TELEGRAM_CHAT_ID`.
- Semua aksi on-chain wajib lewat tombol konfirmasi.

## Disclaimer

LP di DLMM berisiko (impermanent loss, token drop, out-of-range). Gunakan dana yang siap Anda pertaruhkan. Software as-is, tanpa jaminan.
