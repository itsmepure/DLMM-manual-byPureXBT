# Manual DLMM Telegram Bot — Design

Tanggal: 2026-07-14
Status: Disetujui user

## Tujuan

Bot Meteora DLMM **manual** (bukan autonomous) yang dikendalikan lewat Telegram. User yang memutuskan semua aksi: deploy posisi liquidity dan exit. Engine on-chain diambil dari repo agent autonomous milik user (`itsmepure/PureXBT-Pool-pureXBT-dlmm-agent-`), dipangkas dari semua logika AI/agent.

Referensi engine sumber (clone lokal): `C:\Users\PC\AppData\Local\Temp\claude\dlmm-agent-ref`

## Keputusan yang sudah dikunci

| Aspek | Keputusan |
|---|---|
| Interface | Telegram bot (long polling, inline keyboard) |
| Pilih pool | Paste **token mint address** → bot tampilkan daftar pool DLMM token itu (Meteora datapi) → pilih dari tombol |
| Strategi | Spot / Bid-Ask / Curve (SDK `StrategyType`), dipilih per deploy |
| Amount | Tombol preset yang bisa diedit (via `/settings`) + input manual ketik |
| Range | Preset persen (dikonversi ke bin via `getBinIdFromPrice`) + input bin manual |
| Sisi deposit | Single-sided SOL saja (sama seperti engine agent) |
| Exit | Remove liquidity 100% + claim + close, lalu **auto-swap** semua token non-SOL ke SOL via Jupiter |
| Monitoring | List posisi + PnL, claim fees manual, balance wallet, alert out-of-range (notifikasi saja, tanpa aksi otomatis) |

## Struktur proyek

```
D:\Garapan\manual-DLMM\
├── bot.js                    # BARU — Telegram flow: menu, state percakapan, tombol, alert loop
├── engine\
│   ├── dlmm.js               # dari tools/dlmm.js — DIPANGKAS
│   ├── wallet.js             # dari tools/wallet.js — utuh
│   └── pnl.js                # dari tools/pnl.js — computePositions
├── telegram.js               # dari telegram.js — utuh (polling, tombol, callback, edit message)
├── config.js                 # DIPANGKAS — RPC, wallet, preset, MIN_SAFE_BINS_BELOW, tokens, jupiter
├── logger.js                 # utuh
├── scripts\patch-anchor.js   # WAJIB — postinstall patch ESM untuk @meteora-ag/dlmm@1.9.4
├── positions.json            # store lokal posisi yang dibuka bot (pengganti state.js)
├── settings.json             # preset amount & range yang bisa diedit dari Telegram
├── package.json              # deps: @meteora-ag/dlmm@1.9.4 (pinned), @solana/web3.js, bn.js, bs58, dotenv
├── .env.example
└── .gitignore                # .env, positions.json, node_modules
```

## Engine: apa yang diangkat vs dibuang

### `engine/dlmm.js` — diangkat dari `tools/dlmm.js`

Dipertahankan:
- `getDLMM()` — lazy dynamic import SDK (wajib karena patch ESM)
- `getConnection()`, `getWallet()`, `getPool()` (cache pool), `getActiveBin()`
- `searchPools({ query })` — hit `dlmm.datapi.meteora.ag/pools?query=` (query = token mint)
- `deployPosition()` — strategy map (`spot`/`bid_ask`/`curve` → `StrategyType`), konversi persen→bin, guard `MIN_SAFE_BINS_BELOW`, `assertRangeDoesNotRequireBinArrayInitialization`, path standar ≤69 bin (`initializePositionAndAddLiquidityByStrategy`, slippage 1000 bps) dan path lebar >69 bin (`createExtendedEmptyPosition` + `addLiquidityByStrategyChunkable`)
- `claimFees()` — `pool.claimSwapFee`
- `closePosition()` — pre-flight cek posisi masih terbuka, claim fees dulu, lalu `removeLiquidity({ bps: 10000, shouldClaimAndClose: true })`, atau `pool.closePosition` jika kosong

Dibuang total:
- Semua import & call ke `state.js`, `pool-memory.js`, `lessons.js`, `decision-log.js`, `signal-tracker.js`
- Seluruh jalur relay Agent Meridian / LPAgent
- Ekor ~500 baris verifikasi/closed-PnL di `closePosition`
- Cooldown pool/mint (anti-churn agent)

Pengganti tracking: `positions.json` lokal — dicatat saat deploy sukses (position address, pool, pair name, strategi, amount, bin range, timestamp), dihapus saat close sukses. Dipakai untuk daftar exit cepat dan alert out-of-range.

### `engine/wallet.js` — utuh
Keypair dari `WALLET_PRIVATE_KEY` (base58), `getWalletBalances` (Helius + fallback RPC murni), `swapToken` (Jupiter Swap v2 order→sign→execute), `normalizeMint`.

### `engine/pnl.js` — diangkat
`computePositions(walletAddress)` — PnL on-chain murni via `DLMM.getAllLbPairPositionsByUser`. Dipakai untuk tampilan `/positions`.

### `telegram.js` — utuh
`sendMessage`, `sendMessageWithButtons`, `editMessageWithButtons`, `answerCallbackQuery`, `startPolling(onMessage)` dengan dukungan callback_query. Fungsi `notify*` agent-spesifik boleh dibuang.

### `config.js` — dipangkas
Dipertahankan: `RPC_URL`, `WALLET_PRIVATE_KEY` (env), `MIN_SAFE_BINS_BELOW = 35`, `tokens` (mint SOL/USDC), `jupiter` (apiKey opsional), `gasReserve`. Dibuang: management/risk/darwin/screening/openrouter/dll.

### Tidak dibawa sama sekali
`agent.js`, `index.js`, `dashboard.js`, `lessons.js`, `hivemind.js`, `pool-scorer.js`, `screening.js`, `executor.js` (dispatcher; logika auto-sweep-nya ditulis ulang ringkas di bot.js), `envcrypt.js` (opsional, tidak dipakai — `.env` plaintext), card renderer, discord listener.

## Alur Telegram

### Menu utama (`/start` atau `/menu`)
Tombol: 🚀 Deploy | 📊 Positions | 💰 Balance | ⚙️ Settings

### Alur deploy
1. Tombol **Deploy** → bot minta paste token mint address
2. Bot panggil `searchPools(mint)` → tampilkan max ~6 pool sebagai tombol: `NAMA | binStep | baseFee% | TVL`
3. Pilih pool → pilih strategi: **Spot / Bid-Ask / Curve**
4. Pilih amount: tombol preset dari `settings.json` (default mis. 0.5 / 1 / 2 SOL) + tombol "Ketik manual"
5. Pilih range: tombol preset persen dari `settings.json` (default mis. -5%/+3%, -10%/+3%, -20%/+3%) + tombol "Ketik bin manual"
6. Layar konfirmasi: pool, strategi, amount, range (persen + jumlah bin + harga batas), cek saldo (amount + gasReserve ≤ saldo SOL) → ✅ Deploy / ❌ Batal
7. Deploy → balas tx hash (link solscan) + position address; catat ke `positions.json`

State percakapan: satu objek in-memory per chat (hanya 1 chat diizinkan) dengan `step` + data terkumpul. Tombol ❌ Batal di setiap langkah mereset state.

### Alur exit
1. Tombol **Positions** → `computePositions` + `positions.json` → daftar per posisi: pair, nilai USD, PnL, unclaimed fees, in/out-range, dengan tombol per posisi: 💸 Claim | 🚪 Exit
2. **Claim** → konfirmasi → `claimFees` → balas hasil
3. **Exit** → konfirmasi → `closePosition` → auto-swap: cek balance, semua token non-SOL/non-USDC hasil posisi di-swap ke SOL via `swapToken` → laporan akhir (tx hash, hasil swap)

### Balance
Tombol **Balance** → `getWalletBalances` → SOL, USDC, token lain + total USD.

### Settings
Tombol **Settings** → edit preset amount (daftar angka SOL) dan preset range (pasangan downside%/upside%) → disimpan ke `settings.json`.

### Alert out-of-range
Loop `setInterval` ±2 menit: untuk tiap posisi di `positions.json`, bandingkan `getActiveBin` pool vs bin range posisi. Keluar range → kirim alert **sekali** (flag `alerted` di positions.json, direset saat kembali in-range). Tidak ada aksi otomatis apa pun.

## Keamanan

- Bot hanya memproses update dari `TELEGRAM_CHAT_ID` di `.env`; chat/user lain diabaikan diam-diam.
- `.env` (gitignored): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `WALLET_PRIVATE_KEY`, `RPC_URL`, opsional `HELIUS_API_KEY`, `JUPITER_API_KEY`.
- Semua aksi on-chain (deploy/claim/exit/swap) selalu lewat layar konfirmasi eksplisit.

## Error handling

- Semua aksi on-chain dibungkus try/catch; error dikirim sebagai pesan Telegram ringkas + log detail di console. Bot tidak boleh crash karena satu aksi gagal.
- Pre-flight sebelum close: cek posisi masih terbuka on-chain (menghindari error `0xbbf`).
- Pre-flight sebelum deploy: cek saldo cukup (amount + gasReserve), cek range tidak butuh inisialisasi bin array baru.
- Polling Telegram: error jaringan → retry dengan backoff, polling tidak mati.
- `positions.json` ditulis atomik (write temp + rename) agar tidak korup.

## Testing

- Uji manual di jaringan mainnet dengan amount kecil (engine sudah terbukti di agent).
- Smoke test tanpa transaksi: `searchPools`, `getActiveBin`, `getWalletBalances`, `computePositions`, konversi persen→bin (bisa diuji terhadap pool nyata secara read-only).
- Uji alur Telegram end-to-end: deploy kecil → positions → claim → exit → verifikasi auto-swap.

## Di luar scope (eksplisit)

- Semua logika autonomous: screening, scoring, lessons, auto-close, auto-compound, chase, cooldown.
- Two-sided deposit / single-sided token.
- Priority fee / ComputeBudget (tidak ada di engine sumber; bisa ditambah nanti kalau perlu).
- Multi-wallet, multi-chat, dashboard web.
