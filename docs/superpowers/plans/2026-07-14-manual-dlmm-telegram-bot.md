# Manual DLMM Telegram Bot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bot Telegram manual untuk deploy/exit posisi Meteora DLMM (strategi Spot/Bid-Ask/Curve), engine diangkat dari repo agent autonomous milik user.

**Architecture:** Engine on-chain (deploy/claim/close/swap) disalin-dan-dipangkas dari clone referensi di `C:\Users\PC\AppData\Local\Temp\claude\dlmm-agent-ref` (selanjutnya disebut `REF`). Lapisan Telegram (polling + inline keyboard) disalin utuh. Di atasnya ditulis `bot.js` baru: state machine percakapan satu-chat dengan alur deploy 7 langkah, alur exit, settings, dan alert loop out-of-range (notifikasi saja).

**Tech Stack:** Node.js ≥18 ESM, `@meteora-ag/dlmm@1.9.4` (pinned + patch ESM), `@solana/web3.js`, `bn.js`, `bs58`, `dotenv`, Telegram Bot API via `fetch` (tanpa library), `node:test` untuk unit test.

**Spec:** `docs/superpowers/specs/2026-07-14-manual-dlmm-telegram-bot-design.md`

## Global Constraints

- `package.json` harus `"type": "module"`; semua file ESM.
- `@meteora-ag/dlmm` dipinned exact `1.9.4`; `postinstall` menjalankan `node scripts/patch-anchor.js` — tanpa ini `import("@meteora-ag/dlmm")` gagal.
- SDK selalu di-load lazy via dynamic `import()` (pola `getDLMM()` dari sumber) — jangan ubah ke static import.
- Single-sided SOL saja: `totalXAmount = BN(0)`, deposit hanya sisi Y (SOL).
- `MIN_SAFE_BINS_BELOW = 35` dipertahankan sebagai guard minimum bins di bawah harga aktif.
- Slippage mengikuti sumber apa adanya (1000 bps path standar; wide-range path pakai nilai sumber).
- Bot hanya merespons chat dengan id `TELEGRAM_CHAT_ID` dari `.env`; tidak ada auto-register chat id.
- Tidak ada aksi on-chain otomatis. Alert out-of-range hanya mengirim notifikasi.
- Semua aksi on-chain (deploy/claim/exit) wajib lewat layar konfirmasi ✅/❌.
- File JSON lokal (`positions.json`, `settings.json`) ditulis atomik (tmp + rename) dan masuk `.gitignore` (kecuali `settings.json` boleh di-commit default-nya — TIDAK: gitignore keduanya, default dibuat runtime).
- Commit sering; pesan commit bahasa Inggris singkat, diakhiri `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- `REF` = `C:\Users\PC\AppData\Local\Temp\claude\dlmm-agent-ref`. Jika folder itu hilang, clone ulang: `git clone --depth 1 https://github.com/itsmepure/PureXBT-Pool-pureXBT-dlmm-agent- <REF>`.

---

### Task 1: Scaffold proyek + infra yang disalin utuh

**Files:**
- Create: `package.json`, `.gitignore`, `.env.example`
- Create (salin dari REF): `logger.js` ← `REF\logger.js`, `scripts/patch-anchor.js` ← `REF\scripts\patch-anchor.js`

**Interfaces:**
- Produces: `log(tag, message)` dari `logger.js`; node_modules terpasang dengan SDK yang bisa di-import.

- [ ] **Step 1: Tulis `package.json`**

```json
{
  "name": "manual-dlmm-bot",
  "version": "1.0.0",
  "type": "module",
  "description": "Manual Meteora DLMM Telegram bot — deploy/exit with Spot, Bid-Ask, Curve strategies",
  "main": "bot.js",
  "scripts": {
    "start": "node bot.js",
    "test": "node --test test/",
    "smoke": "node scripts/smoke.js",
    "postinstall": "node scripts/patch-anchor.js"
  },
  "dependencies": {
    "@meteora-ag/dlmm": "1.9.4",
    "@solana/web3.js": "^1.95.0",
    "bn.js": "^5.2.1",
    "bs58": "^5.0.0",
    "dotenv": "^17.3.1"
  },
  "engines": { "node": ">=18.0.0" }
}
```

- [ ] **Step 2: Tulis `.gitignore`**

```
node_modules/
.env
positions.json
settings.json
*.log
```

- [ ] **Step 3: Tulis `.env.example`**

```
# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-your-bot-token
TELEGRAM_CHAT_ID=123456789

# Solana
WALLET_PRIVATE_KEY=base58-secret-key
RPC_URL=https://mainnet.helius-rpc.com/?api-key=xxx

# Opsional
HELIUS_API_KEY=
JUPITER_API_KEY=
```

- [ ] **Step 4: Salin file infra dari REF (verbatim, tanpa edit)**

```powershell
Copy-Item "$env:TEMP\claude\dlmm-agent-ref\logger.js" "D:\Garapan\manual-DLMM\logger.js"
New-Item -ItemType Directory -Force "D:\Garapan\manual-DLMM\scripts"
Copy-Item "$env:TEMP\claude\dlmm-agent-ref\scripts\patch-anchor.js" "D:\Garapan\manual-DLMM\scripts\patch-anchor.js"
```

Lalu buka `logger.js` — jika ia meng-import modul selain built-in Node (mis. modul agent), hapus import itu dan bagian yang memakainya sehingga tersisa logger console/file murni dengan export `log(tag, message)`.

- [ ] **Step 5: Install dan verifikasi patch SDK jalan**

Run: `npm install`
Expected: sukses, output postinstall patch-anchor tampil tanpa error.

Run: `node -e "import('@meteora-ag/dlmm').then(m => console.log('SDK OK, StrategyType:', Object.keys(m.StrategyType ?? m.default?.StrategyType ?? {})))"`
Expected: cetak `SDK OK` dengan daftar berisi `Spot`, `Curve`, `BidAsk` (tanpa throw ESM resolution error).

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json .gitignore .env.example logger.js scripts/patch-anchor.js
git commit -m "chore: scaffold project, vendor logger and anchor ESM patch"
```

---

### Task 2: `config.js` terpangkas

**Files:**
- Create: `config.js`
- Test: `test/config.test.js`

**Interfaces:**
- Produces: named export `MIN_SAFE_BINS_BELOW` (number, 35); named export `config` (juga default export) dengan bentuk persis:
  `config.tokens.{sol,usdc}` (string mint), `config.jupiter.{apiKey,referralAccount,referralFeeBps}`, `config.pnl.{rpcUrl,source}`, `config.strategy.{strategy,defaultBinsBelow}`, `config.management.{deployUpsidePct,gasReserve}`.
- Catatan: kunci `strategy`/`management` dipertahankan karena `deployPosition` sumber membacanya sebagai default.

- [ ] **Step 1: Tulis failing test `test/config.test.js`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import config, { MIN_SAFE_BINS_BELOW } from "../config.js";

test("MIN_SAFE_BINS_BELOW is 35", () => {
  assert.equal(MIN_SAFE_BINS_BELOW, 35);
});

test("config has required keys", () => {
  assert.equal(config.tokens.sol, "So11111111111111111111111111111111111111112");
  assert.equal(config.tokens.usdc, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  assert.ok(config.pnl);
  assert.equal(config.pnl.source, "rpc");
  assert.ok(config.strategy.strategy);
  assert.ok(config.management.gasReserve > 0);
});
```

- [ ] **Step 2: Run test, verifikasi gagal**

Run: `node --test test/config.test.js`
Expected: FAIL (`Cannot find module '../config.js'`)

- [ ] **Step 3: Tulis `config.js`**

```js
// Trimmed config for the manual bot. Source of truth: env (.env).
import "dotenv/config";

export const MIN_SAFE_BINS_BELOW = 35;

export const config = {
  tokens: {
    sol: "So11111111111111111111111111111111111111112",
    usdc: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
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
```

- [ ] **Step 4: Run test, verifikasi lulus**

Run: `node --test test/config.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```powershell
git add config.js test/config.test.js
git commit -m "feat: trimmed config with strategy/management defaults"
```

---

### Task 3: `store.js` — positions.json & settings.json atomik

**Files:**
- Create: `store.js`
- Test: `test/store.test.js`

**Interfaces:**
- Produces:
  - `loadSettings()` → `{ amountPresets: number[], rangePresets: {down:number,up:number}[] }` (buat file dengan default jika belum ada)
  - `saveSettings(settings)` → void
  - `loadPositions()` → array posisi
  - `addPosition(p)` → void; `p = { position, pool, pool_name, strategy, amount_sol, min_bin, max_bin, opened_at, alerted }`
  - `removePosition(positionAddress)` → void
  - `setAlerted(positionAddress, bool)` → void
  - Semua write: tulis ke `<file>.tmp` lalu `fs.renameSync` (atomik).
  - Lokasi file bisa dioverride via env `STORE_DIR` (dipakai test agar tidak menyentuh file asli).

- [ ] **Step 1: Tulis failing test `test/store.test.js`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

process.env.STORE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "dlmm-store-"));
const { loadSettings, saveSettings, loadPositions, addPosition, removePosition, setAlerted } =
  await import("../store.js");

test("settings default dibuat saat pertama load", () => {
  const s = loadSettings();
  assert.deepEqual(s.amountPresets, [0.5, 1, 2]);
  assert.deepEqual(s.rangePresets, [
    { down: 5, up: 3 },
    { down: 10, up: 3 },
    { down: 20, up: 3 },
  ]);
});

test("saveSettings lalu loadSettings roundtrip", () => {
  saveSettings({ amountPresets: [0.1], rangePresets: [{ down: 7, up: 2 }] });
  const s = loadSettings();
  assert.deepEqual(s.amountPresets, [0.1]);
});

test("positions add/remove/alerted", () => {
  assert.deepEqual(loadPositions(), []);
  addPosition({ position: "P1", pool: "POOL1", pool_name: "X-SOL", strategy: "spot",
    amount_sol: 1, min_bin: 10, max_bin: 50, opened_at: "2026-07-14T00:00:00Z", alerted: false });
  assert.equal(loadPositions().length, 1);
  setAlerted("P1", true);
  assert.equal(loadPositions()[0].alerted, true);
  removePosition("P1");
  assert.deepEqual(loadPositions(), []);
});
```

- [ ] **Step 2: Run test, verifikasi gagal**

Run: `node --test test/store.test.js`
Expected: FAIL (`Cannot find module '../store.js'`)

- [ ] **Step 3: Tulis `store.js`**

```js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.env.STORE_DIR || __dirname;
const SETTINGS_PATH = () => path.join(DIR, "settings.json");
const POSITIONS_PATH = () => path.join(DIR, "positions.json");

const DEFAULT_SETTINGS = {
  amountPresets: [0.5, 1, 2],
  rangePresets: [
    { down: 5, up: 3 },
    { down: 10, up: 3 },
    { down: 20, up: 3 },
  ],
};

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

export function loadSettings() {
  const s = readJson(SETTINGS_PATH(), null);
  if (!s) {
    writeJsonAtomic(SETTINGS_PATH(), DEFAULT_SETTINGS);
    return structuredClone(DEFAULT_SETTINGS);
  }
  return { ...structuredClone(DEFAULT_SETTINGS), ...s };
}

export function saveSettings(settings) {
  writeJsonAtomic(SETTINGS_PATH(), settings);
}

export function loadPositions() {
  return readJson(POSITIONS_PATH(), { positions: [] }).positions;
}

function savePositions(positions) {
  writeJsonAtomic(POSITIONS_PATH(), { positions });
}

export function addPosition(p) {
  const positions = loadPositions();
  positions.push(p);
  savePositions(positions);
}

export function removePosition(positionAddress) {
  savePositions(loadPositions().filter((p) => p.position !== positionAddress));
}

export function setAlerted(positionAddress, alerted) {
  const positions = loadPositions();
  const found = positions.find((p) => p.position === positionAddress);
  if (found) {
    found.alerted = alerted;
    savePositions(positions);
  }
}
```

- [ ] **Step 4: Run test, verifikasi lulus**

Run: `node --test test/store.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```powershell
git add store.js test/store.test.js
git commit -m "feat: atomic JSON stores for positions and editable presets"
```

---

### Task 4: `engine/wallet.js` — salin utuh

**Files:**
- Create: `engine/wallet.js` ← `REF\tools\wallet.js`
- Test: `test/wallet.test.js`

**Interfaces:**
- Produces (dipakai task lain): `getWallet()` → Keypair; `getConnection()` → Connection; `getWalletBalances(opts)` → `{ wallet, sol, sol_price, sol_usd, usdc, tokens[], total_usd }`; `swapToken({ input_mint, output_mint, amount })` → hasil Jupiter v2; `normalizeMint(mint)` → string mint (map `"SOL"`/`"native"` → wSOL).

- [ ] **Step 1: Salin dan sesuaikan path import**

```powershell
New-Item -ItemType Directory -Force "D:\Garapan\manual-DLMM\engine"
Copy-Item "$env:TEMP\claude\dlmm-agent-ref\tools\wallet.js" "D:\Garapan\manual-DLMM\engine\wallet.js"
```

Edit `engine/wallet.js`: import `../config.js` dan `../logger.js` sudah benar relatif terhadap `engine/` (sumber di `tools/` juga pakai `../`). Verifikasi tiap import di bagian atas file hanya menunjuk: `@solana/web3.js`, `bs58`, `../config.js`, `../logger.js`, built-in Node. Jika ada import lain (modul agent), hapus import itu beserta fungsi yang memakainya (fungsi yang dihapus TIDAK boleh termasuk yang ada di daftar Produces di atas).

- [ ] **Step 2: Syntax check**

Run: `node --check engine/wallet.js`
Expected: exit 0

- [ ] **Step 3: Tulis test offline `test/wallet.test.js`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMint } from "../engine/wallet.js";

const WSOL = "So11111111111111111111111111111111111111112";

test("normalizeMint maps SOL aliases", () => {
  assert.equal(normalizeMint("SOL"), WSOL);
  assert.equal(normalizeMint("native"), WSOL);
  assert.equal(normalizeMint(WSOL), WSOL);
});

test("normalizeMint passes through other mints", () => {
  const usdc = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  assert.equal(normalizeMint(usdc), usdc);
});
```

Catatan: jika perilaku `normalizeMint` sumber berbeda (mis. tidak menerima `"native"`), sesuaikan assertion dengan perilaku sumber — jangan ubah engine.

- [ ] **Step 4: Run test, verifikasi lulus**

Run: `node --test test/wallet.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add engine/wallet.js test/wallet.test.js
git commit -m "feat: vendor wallet engine (keypair, balances, jupiter swap)"
```

---

### Task 5: `engine/dlmm.js` — salin dan pangkas

**Files:**
- Create: `engine/dlmm.js` ← dipangkas dari `REF\tools\dlmm.js`
- Test: `test/dlmm.test.js`
- Create: `scripts/smoke.js` (smoke read-only)

**Interfaces:**
- Produces:
  - `getActiveBin({ pool_address })` → `{ binId, price, pricePerLamport }`
  - `searchPools({ query, limit })` → `{ query, total, pools: [{ pool, name, bin_step, fee_pct, tvl, volume_24h, token_x, token_y }] }`
  - `deployPosition({ pool_address, strategy, amount_sol, bins_below, bins_above, downside_pct, upside_pct })` → sukses: `{ success: true, position, pool, pool_name, bin_range: {min,max,active}, price_range: {min,max}, range_coverage, bin_step, txs }`; gagal: `{ success: false, error }`
  - `claimFees({ position_address, pool_address })` → `{ success, position, txs, base_mint }` atau `{ success: false, error }`
  - `closePosition({ position_address, pool_address })` → `{ success, position, pool, claim_txs, close_txs, base_mint, already_closed? }` atau `{ success: false, error }`
  - `getDLMM()` → SDK lazy (dipakai test)
- Consumes: `normalizeMint` dari `./wallet.js` (path relatif berubah dari `./wallet.js` sumber — tetap `./wallet.js` karena sefolder), `config`/`MIN_SAFE_BINS_BELOW` dari `../config.js`, `log` dari `../logger.js`.

- [ ] **Step 1: Salin file mentah**

```powershell
Copy-Item "$env:TEMP\claude\dlmm-agent-ref\tools\dlmm.js" "D:\Garapan\manual-DLMM\engine\dlmm.js"
```

- [ ] **Step 2: Pangkas — hapus semua ketergantungan agent**

Urutan operasi pada `engine/dlmm.js` (line numbers merujuk file SUMBER `REF\tools\dlmm.js`):

1. **Header imports (baris 1–33):** hapus import dari `../state.js`, `../pool-memory.js`, `../lessons.js`, `../decision-log.js`, `../signal-tracker.js`, `./pnl.js`, dan `../tools/agent-meridian.js`/`./agent-meridian.js`. Pertahankan: `@solana/web3.js`, `bn.js`, `bs58`, `../config.js` (`config`, `MIN_SAFE_BINS_BELOW`; hapus `computeDeployAmount` dari import — fungsi itu tidak ada di config baru), `../logger.js`, `./wallet.js` (`normalizeMint`).
2. **Hapus fungsi relay/agent utuh:** `shouldUseLpAgentRelay*` (sekitar :106), `fetchLpAgentOpenPositions` (:954), `fetchDlmmPnlForPool` (:986), `getPositionPnl` (:1013), `getMyPositions` (:1211 s/d sebelum `getWalletPositions`), `getWalletPositions` (:1473), `resetDlmmWallet` (:2254), dan helper `lookupPoolForPosition` (:2229) — pool sekarang selalu diberikan eksplisit.
3. **`deployPosition` (:453):**
   - Hapus blok cooldown pool/mint (:480-495, `isPoolOnCooldown`/`isBaseMintOnCooldown`).
   - Hapus seluruh cabang relay (`if (shouldUseLpAgentRelayForDeploy()) { ... }` :635-778).
   - Hapus panggilan pasca-sukses ke `trackPosition`, `markPoolOpened`, `appendDecision`, `getAndClearStagedSignals` (blok sekitar return sukses :920) — return object dipertahankan.
   - Jika ada fallback `computeDeployAmount(...)` saat amount kosong, ganti dengan: `if (!Number.isFinite(finalAmountY) || finalAmountY <= 0) return { success: false, error: "amount_sol wajib diisi" };` (sesuaikan nama variabel dengan sumber).
   - Pertahankan: strategy map spot/curve/bid_ask (:520-528), konversi `downside_pct`/`upside_pct` → bins via `getBinIdFromPrice` (:500-517), guard `MIN_SAFE_BINS_BELOW` (:573-579), `assertRangeDoesNotRequireBinArrayInitialization` (:297, dipanggil :614), path standar `initializePositionAndAddLiquidityByStrategy` (:852-861), path wide-range `createExtendedEmptyPosition` + `addLiquidityByStrategyChunkable` (:791-828), guard single-sided (amount_x harus 0, :542-547).
4. **`claimFees` (:1562):** ubah signature jadi `({ position_address, pool_address })`; hapus cek `getTrackedPosition`/`tracked.closed` (:1568-1571), hapus `recordClaim` (:1598), hapus baris `_positionsCacheAt = 0` jika variabel cache-nya ikut terhapus; ganti `lookupPoolForPosition(...)` dengan `pool_address` yang diberikan (tetap `poolCache.delete(...)` + `getPool(pool_address)` agar fee state segar). Sisanya (getPosition → claimSwapFee → loop sendAndConfirmTransaction → return `{ success, position, txs, base_mint }`) dipertahankan verbatim.
5. **`closePosition` (:1608):** tulis ulang jadi versi lean dengan signature `({ position_address, pool_address })`:
   - Buang pre-flight berbasis `getMyPositions` (:1620-1645); ganti: `try { positionData = await pool.getPosition(positionPubKey) } catch { return { success: true, already_closed: true, ... } }`.
   - Buang seluruh cabang relay (:1649-1903) dan seluruh ekor verifikasi/closed-PnL/bookkeeping (:1754-1903 dan :1981-2250).
   - Angkat verbatim blok jalur langsung :1905-1980: claim fees dulu (claimSwapFee, lanjut walau gagal), deteksi liquidity dari `positionBinData[].positionLiquidity` (:1941-1952), lalu `pool.removeLiquidity({ user, position, fromBinId, toBinId, bps: new BN(10000), shouldClaimAndClose: true })` (:1956-1963) atau `pool.closePosition({ owner, position })` jika kosong (:1971-1976), semua via `sendAndConfirmTransaction(getConnection(), tx, [wallet])`.
   - Return: `{ success: true, position: position_address, pool: pool_address, claim_txs, close_txs, base_mint: pool.lbPair.tokenXMint.toString() }`.
6. **Pertahankan utuh:** `getDLMM` (:50), `getConnection` (:84), `getWallet` (:91), `assertRangeDoesNotRequireBinArrayInitialization` (:297), `getPool` + `poolCache` (:394), `getActiveBin` (:440), `searchPools` (:1539).
7. Hapus semua sisa referensi `DRY_RUN` boleh dipertahankan (tidak berbahaya) — biarkan sesuai sumber.

- [ ] **Step 3: Syntax check**

Run: `node --check engine/dlmm.js`
Expected: exit 0. Lalu: `node -e "const m = await import('./engine/dlmm.js'); console.log(Object.keys(m))"` → harus memuat `getActiveBin, searchPools, deployPosition, claimFees, closePosition, getDLMM` tanpa error import.

- [ ] **Step 4: Tulis test offline `test/dlmm.test.js`** (SDK pure functions, tanpa network/wallet)

```js
import test from "node:test";
import assert from "node:assert/strict";
import { getDLMM } from "../engine/dlmm.js";

test("SDK strategy enum has Spot/BidAsk/Curve", async () => {
  const { StrategyType } = await getDLMM();
  assert.ok(StrategyType.Spot !== undefined);
  assert.ok(StrategyType.BidAsk !== undefined);
  assert.ok(StrategyType.Curve !== undefined);
});

test("pct->bin conversion math is sane (pure SDK fns)", async () => {
  const { getBinIdFromPrice, getPriceOfBinByBinId } = await getDLMM();
  const binStep = 100; // 1% per bin
  const activeBinId = 0;
  const activePrice = Number(getPriceOfBinByBinId(activeBinId, binStep).toString());
  // -10% target => sekitar 10-11 bins di bawah untuk binStep 1%
  const targetPrice = activePrice * 0.9;
  const targetBinId = Number(getBinIdFromPrice(targetPrice, binStep, true).toString());
  const binsBelow = activeBinId - targetBinId;
  assert.ok(binsBelow >= 9 && binsBelow <= 12, `binsBelow=${binsBelow}`);
});
```

- [ ] **Step 5: Run test, verifikasi lulus**

Run: `node --test test/dlmm.test.js`
Expected: PASS (2 tests). Jika signature pure-fn SDK beda (BN vs number), sesuaikan konversi di test, bukan engine.

- [ ] **Step 6: Tulis smoke script read-only `scripts/smoke.js`** (butuh `.env` berisi `RPC_URL`; TIDAK mengirim transaksi)

```js
import "dotenv/config";
import { searchPools, getActiveBin } from "../engine/dlmm.js";

const WSOL = "So11111111111111111111111111111111111111112";
const res = await searchPools({ query: WSOL, limit: 3 });
console.log(`searchPools: ${res.total} pools`);
for (const p of res.pools) console.log(` - ${p.name} | binStep ${p.bin_step} | fee ${p.fee_pct}% | pool ${p.pool}`);
if (res.pools[0]) {
  const ab = await getActiveBin({ pool_address: res.pools[0].pool });
  console.log(`activeBin ${res.pools[0].name}: binId=${ab.binId} price=${ab.price}`);
}
console.log("SMOKE OK");
```

Run: `npm run smoke` (hanya jika `.env` dengan `RPC_URL` tersedia; kalau belum, tandai untuk dijalankan di Task 13)
Expected: daftar pool + active bin + `SMOKE OK`.

- [ ] **Step 7: Commit**

```powershell
git add engine/dlmm.js test/dlmm.test.js scripts/smoke.js
git commit -m "feat: lean DLMM engine - deploy/claim/close/search, agent logic stripped"
```

---

### Task 6: `engine/pnl.js` — salin computePositions

**Files:**
- Create: `engine/pnl.js` ← `REF\tools\pnl.js`

**Interfaces:**
- Produces: `computePositions(walletAddress)` → `{ wallet, total_positions, positions: [...], source: "rpc" }` — tiap posisi minimal memuat `position` (address), `pool`, nilai/fees, `lower_bin`/`upper_bin` atau setara (ikuti bentuk sumber; bot membaca defensif).

- [ ] **Step 1: Salin dan sesuaikan**

```powershell
Copy-Item "$env:TEMP\claude\dlmm-agent-ref\tools\pnl.js" "D:\Garapan\manual-DLMM\engine\pnl.js"
```

Verifikasi import hanya: `@solana/web3.js`, SDK (lazy), `../config.js`, `../logger.js`, built-in. Hapus import/fungsi agent lain jika ada (jangan hapus `computePositions` dan helper-nya).

- [ ] **Step 2: Syntax check + import check**

Run: `node --check engine/pnl.js` lalu `node -e "const m = await import('./engine/pnl.js'); console.log(typeof m.computePositions)"`
Expected: `function`

- [ ] **Step 3: Commit**

```powershell
git add engine/pnl.js
git commit -m "feat: vendor on-chain PnL engine (computePositions)"
```

---

### Task 7: `telegram.js` — salin dan pangkas

**Files:**
- Create: `telegram.js` ← `REF\telegram.js`

**Interfaces:**
- Produces: `isEnabled()`, `sendMessage(text)`, `sendMessageWithButtons(text, inlineKeyboard)`, `editMessage(text, messageId)`, `editMessageWithButtons(text, messageId, inlineKeyboard)`, `answerCallbackQuery(id, text?)`, `startPolling(onMessage)`, `stopPolling()`.
- `onMessage` menerima: pesan teks `{ chat, from, text }` ATAU callback `{ chat, from, text, isCallback: true, callbackQueryId, callbackData, messageId }`.
- `inlineKeyboard` = array of rows; row = array of `{ text, callback_data }`.

- [ ] **Step 1: Salin dan pangkas**

```powershell
Copy-Item "$env:TEMP\claude\dlmm-agent-ref\telegram.js" "D:\Garapan\manual-DLMM\telegram.js"
```

Edit:
1. Hapus `import { sendPnlCard } from "./notify-card.js"` (baris 5) dan semua pemakaiannya.
2. Hapus persistence chatId via `user-config.json`: fungsi `loadChatId`/`saveChatId` (baris 27-48) + panggilan `loadChatId()` (baris 50) + konstanta `USER_CONFIG_PATH`. `chatId` murni dari `process.env.TELEGRAM_CHAT_ID` (baris 19, dipertahankan).
3. Hapus semua fungsi `notify*` (dari `notifyDeploy` :430 sampai akhir blok notification helpers), `createLiveMessage` (:279) beserta helper live-message (`hasActiveLiveMessage`, `_liveMessageDepth`, `toolLabel`, `createTypingIndicator` — hapus jika tidak dipakai fungsi yang dipertahankan).
4. Pertahankan: auth `isAuthorizedIncomingMessage` (:52-80), retry `fetchTgRetry` (:88), `postTelegram`/`postTelegramRaw`, semua fungsi di daftar Produces, long polling `poll`/`startPolling`/`stopPolling` (:375-427), helper `sleep` yang dipakai poll.

- [ ] **Step 2: Syntax + import check**

Run: `node --check telegram.js` lalu `node -e "const m = await import('./telegram.js'); console.log(typeof m.startPolling, typeof m.sendMessageWithButtons)"`
Expected: `function function`

- [ ] **Step 3: Commit**

```powershell
git add telegram.js
git commit -m "feat: vendor telegram layer (polling, buttons), notifications stripped"
```

---

### Task 8: `bot/format.js` — formatter pesan

**Files:**
- Create: `bot/format.js`
- Test: `test/format.test.js`

**Interfaces:**
- Produces: `shortAddr(a)` → `"AbCd..WxYz"`; `fmtNum(n, dp=4)` → string tanpa trailing zero berlebih; `fmtUsd(n)` → `"$1,234.56"`; `solscanTx(sig)` / `solscanAccount(addr)` → URL string; `strategyLabel(s)` → `"Spot"|"Bid-Ask"|"Curve"`.

- [ ] **Step 1: Tulis failing test `test/format.test.js`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { shortAddr, fmtNum, fmtUsd, solscanTx, strategyLabel } from "../bot/format.js";

test("shortAddr", () => {
  assert.equal(shortAddr("So11111111111111111111111111111111111111112"), "So11..1112");
});
test("fmtNum trims", () => {
  assert.equal(fmtNum(1.5), "1.5");
  assert.equal(fmtNum(0.123456, 4), "0.1235");
});
test("fmtUsd", () => {
  assert.equal(fmtUsd(1234.5), "$1,234.50");
  assert.equal(fmtUsd(-3.2), "-$3.20");
});
test("solscanTx", () => {
  assert.equal(solscanTx("abc"), "https://solscan.io/tx/abc");
});
test("strategyLabel", () => {
  assert.equal(strategyLabel("spot"), "Spot");
  assert.equal(strategyLabel("bid_ask"), "Bid-Ask");
  assert.equal(strategyLabel("curve"), "Curve");
});
```

- [ ] **Step 2: Run test, verifikasi gagal**

Run: `node --test test/format.test.js`
Expected: FAIL (module not found)

- [ ] **Step 3: Tulis `bot/format.js`**

```js
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
```

- [ ] **Step 4: Run test, verifikasi lulus**

Run: `node --test test/format.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```powershell
git add bot/format.js test/format.test.js
git commit -m "feat: message formatting helpers"
```

---

### Task 9: `bot/session.js` + `bot.js` skeleton (router, menu, balance)

**Files:**
- Create: `bot/session.js`, `bot.js`

**Interfaces:**
- `bot/session.js` Produces: `getSession()` → objek singleton `{ step: string|null, data: object, awaitingText: null | (text) => Promise<void> }`; `resetSession()` → kosongkan step/data/awaitingText.
- `bot.js` Produces (untuk Task 10-12): registry handler — `commandHandlers` (map string → fn(msg)) dan `callbackHandlers` (array `{ prefix, fn(msg, arg) }`); fungsi `mainMenu(messageId?)` untuk kembali ke menu. Task 10-12 menambahkan flow dengan meng-import dari modul flow dan mendaftarkannya di `bot.js`.
- Callback data convention (dipakai semua task): `"menu"`, `"bal"`, `"dep"` (mulai deploy), `"pos"` (list posisi), `"set"` (settings), `"cancel"`, dan prefix flow: `"dep:*"`, `"pos:*"`, `"set:*"`.

- [ ] **Step 1: Tulis `bot/session.js`**

```js
// Satu chat = satu session (bot single-user by design).
const session = { step: null, data: {}, awaitingText: null };

export function getSession() {
  return session;
}

export function resetSession() {
  session.step = null;
  session.data = {};
  session.awaitingText = null;
}
```

- [ ] **Step 2: Tulis `bot.js`**

```js
import "dotenv/config";
import { log } from "./logger.js";
import {
  startPolling, sendMessage, sendMessageWithButtons,
  editMessageWithButtons, answerCallbackQuery,
} from "./telegram.js";
import { getSession, resetSession } from "./bot/session.js";
import { getWalletBalances } from "./engine/wallet.js";
import { fmtNum, fmtUsd, shortAddr } from "./bot/format.js";

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
    .map((t) => `  ${t.symbol || shortAddr(t.mint)}: ${fmtNum(t.amount)} (${fmtUsd(t.usd ?? t.total_usd ?? 0)})`)
    .join("\n");
  const text = [
    `💰 Wallet ${shortAddr(b.wallet)}`,
    `SOL: ${fmtNum(b.sol)} (${fmtUsd(b.sol_usd)})`,
    `USDC: ${fmtNum(b.usdc)}`,
    tokens ? `Tokens:\n${tokens}` : null,
    `Total: ${fmtUsd(b.total_usd)}`,
  ].filter(Boolean).join("\n");
  const buttons = [[{ text: "⬅️ Menu", callback_data: "menu" }]];
  if (messageId) return editMessageWithButtons(text, messageId, buttons);
  return sendMessageWithButtons(text, buttons);
}

// ─── Router ──────────────────────────────────────────────────────
// Task 10-12 mendaftarkan handler flow di kedua registry ini.
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
```

- [ ] **Step 3: Syntax check**

Run: `node --check bot.js; node --check bot/session.js`
Expected: exit 0 keduanya.

- [ ] **Step 4: Uji manual singkat (butuh `.env` terisi)**

Run: `node bot.js` → di Telegram kirim `/start` → menu 4 tombol muncul; tombol 💰 Balance menampilkan saldo; tombol dari chat lain diabaikan. Hentikan dengan Ctrl+C. (Kalau `.env` belum ada, tunda verifikasi ini ke Task 13 dan catat.)

- [ ] **Step 5: Commit**

```powershell
git add bot.js bot/session.js
git commit -m "feat: bot skeleton - router, main menu, balance"
```

---

### Task 10: Alur deploy (`bot/deploy.js`)

**Files:**
- Create: `bot/deploy.js`
- Modify: `bot.js` (daftarkan handler)

**Interfaces:**
- Consumes: `searchPools`, `getActiveBin`, `deployPosition` (engine/dlmm.js); `getWalletBalances` (engine/wallet.js); `loadSettings`, `addPosition` (store.js); session; format; telegram.
- Produces: `registerDeployFlow({ commandHandlers, callbackHandlers, mainMenu })` — dipanggil `bot.js`.
- Callback data: `"dep"` mulai; `"dep:pool:<i>"`; `"dep:strat:<spot|bid_ask|curve>"`; `"dep:amt:<i>"`; `"dep:amt:c"` (custom); `"dep:rng:<i>"`; `"dep:rng:c"`; `"dep:go"` (konfirmasi final). `"cancel"` di semua layar.

- [ ] **Step 1: Tulis `bot/deploy.js`**

```js
import { sendMessage, sendMessageWithButtons, editMessageWithButtons } from "../telegram.js";
import { searchPools, getActiveBin, deployPosition } from "../engine/dlmm.js";
import { getWalletBalances } from "../engine/wallet.js";
import { loadSettings, addPosition } from "../store.js";
import { getSession, resetSession } from "./session.js";
import config from "../config.js";
import { fmtNum, fmtUsd, shortAddr, solscanTx, strategyLabel } from "./format.js";

const CANCEL_ROW = [{ text: "❌ Batal", callback_data: "cancel" }];
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

async function askMint(messageId) {
  const s = getSession();
  s.step = "dep_mint";
  s.data = {};
  s.awaitingText = onMintInput;
  const text = "🚀 Deploy — paste token mint address:";
  if (messageId) return editMessageWithButtons(text, messageId, [CANCEL_ROW]);
  return sendMessageWithButtons(text, [CANCEL_ROW]);
}

async function onMintInput(text) {
  const mint = text.trim();
  if (!BASE58_RE.test(mint)) {
    getSession().awaitingText = onMintInput;
    return sendMessage("Itu bukan address base58 yang valid. Paste ulang token mint:");
  }
  const res = await searchPools({ query: mint, limit: 6 });
  if (!res.pools.length) {
    getSession().awaitingText = onMintInput;
    return sendMessage("Tidak ada pool DLMM untuk token itu. Coba mint lain:");
  }
  const s = getSession();
  s.step = "dep_pool";
  s.data.pools = res.pools;
  const rows = res.pools.map((p, i) => [{
    text: `${p.name} | step ${p.bin_step} | fee ${fmtNum(p.fee_pct, 2)}% | TVL ${fmtUsd(p.tvl)}`,
    callback_data: `dep:pool:${i}`,
  }]);
  rows.push(CANCEL_ROW);
  return sendMessageWithButtons("Pilih pool:", rows);
}

async function onPool(msg, i) {
  const s = getSession();
  const pool = s.data.pools?.[Number(i)];
  if (!pool) return sendMessage("Sesi kadaluarsa — mulai lagi dari /menu.");
  s.data.pool = pool;
  s.step = "dep_strat";
  return editMessageWithButtons(`Pool: ${pool.name}\nPilih strategi:`, msg.messageId, [
    [{ text: "Spot", callback_data: "dep:strat:spot" },
     { text: "Bid-Ask", callback_data: "dep:strat:bid_ask" },
     { text: "Curve", callback_data: "dep:strat:curve" }],
    CANCEL_ROW,
  ]);
}

async function onStrategy(msg, strat) {
  const s = getSession();
  s.data.strategy = strat;
  s.step = "dep_amt";
  const presets = loadSettings().amountPresets;
  const rows = [presets.map((a, i) => ({ text: `${a} SOL`, callback_data: `dep:amt:${i}` }))];
  rows.push([{ text: "✏️ Ketik manual", callback_data: "dep:amt:c" }]);
  rows.push(CANCEL_ROW);
  return editMessageWithButtons(
    `Strategi: ${strategyLabel(strat)}\nPilih jumlah SOL:`, msg.messageId, rows);
}

async function onAmount(msg, arg) {
  const s = getSession();
  if (arg === "c") {
    s.awaitingText = onAmountInput;
    return sendMessage("Ketik jumlah SOL (mis. 0.75):");
  }
  const amount = loadSettings().amountPresets[Number(arg)];
  if (!amount) return sendMessage("Preset tidak ditemukan — mulai lagi dari /menu.");
  s.data.amount_sol = amount;
  return askRange(msg.messageId);
}

async function onAmountInput(text) {
  const amount = Number(text.replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) {
    getSession().awaitingText = onAmountInput;
    return sendMessage("Angka tidak valid. Ketik jumlah SOL:");
  }
  getSession().data.amount_sol = amount;
  return askRange(null);
}

async function askRange(messageId) {
  const s = getSession();
  s.step = "dep_rng";
  const presets = loadSettings().rangePresets;
  const rows = [presets.map((r, i) => ({ text: `-${r.down}% / +${r.up}%`, callback_data: `dep:rng:${i}` }))];
  rows.push([{ text: "✏️ Ketik bin manual", callback_data: "dep:rng:c" }]);
  rows.push(CANCEL_ROW);
  const text = `Amount: ${s.data.amount_sol} SOL\nPilih range:`;
  if (messageId) return editMessageWithButtons(text, messageId, rows);
  return sendMessageWithButtons(text, rows);
}

async function onRange(msg, arg) {
  const s = getSession();
  if (arg === "c") {
    s.awaitingText = onRangeInput;
    return sendMessage("Ketik `bins_below bins_above` (mis. `40 5`):");
  }
  const r = loadSettings().rangePresets[Number(arg)];
  if (!r) return sendMessage("Preset tidak ditemukan — mulai lagi dari /menu.");
  s.data.downside_pct = r.down;
  s.data.upside_pct = r.up;
  return confirmScreen(msg.messageId);
}

async function onRangeInput(text) {
  const m = text.trim().match(/^(\d+)\s+(\d+)$/);
  if (!m) {
    getSession().awaitingText = onRangeInput;
    return sendMessage("Format: dua angka dipisah spasi, mis. `40 5`. Coba lagi:");
  }
  const s = getSession();
  s.data.bins_below = Number(m[1]);
  s.data.bins_above = Number(m[2]);
  return confirmScreen(null);
}

async function confirmScreen(messageId) {
  const s = getSession();
  const d = s.data;
  s.step = "dep_confirm";
  const [ab, bal] = await Promise.all([
    getActiveBin({ pool_address: d.pool.pool }),
    getWalletBalances({}),
  ]);
  d.active_price = ab.price;
  const need = d.amount_sol + config.management.gasReserve;
  const enough = bal.sol >= need;
  const rangeLine = d.downside_pct != null
    ? `Range: -${d.downside_pct}% / +${d.upside_pct}%`
    : `Range: ${d.bins_below} bins bawah / ${d.bins_above} bins atas`;
  const lines = [
    "⚠️ KONFIRMASI DEPLOY",
    `Pool: ${d.pool.name} (${shortAddr(d.pool.pool)})`,
    `Strategi: ${strategyLabel(d.strategy)}`,
    `Amount: ${d.amount_sol} SOL (single-sided)`,
    rangeLine,
    `Harga aktif: ${fmtNum(ab.price, 8)}`,
    `Saldo SOL: ${fmtNum(bal.sol)} — butuh ~${fmtNum(need)} (termasuk gas reserve)`,
  ];
  if (!enough) lines.push("❌ SALDO TIDAK CUKUP — kurangi amount atau batalkan.");
  const rows = enough
    ? [[{ text: "✅ Deploy", callback_data: "dep:go" }, { text: "❌ Batal", callback_data: "cancel" }]]
    : [CANCEL_ROW];
  const text = lines.join("\n");
  if (messageId) return editMessageWithButtons(text, messageId, rows);
  return sendMessageWithButtons(text, rows);
}

async function onConfirm(msg, _arg, mainMenu) {
  const s = getSession();
  const d = s.data;
  if (s.step !== "dep_confirm" || !d.pool) return sendMessage("Sesi kadaluarsa — mulai lagi dari /menu.");
  s.step = "dep_sending";
  await editMessageWithButtons("⏳ Mengirim transaksi deploy…", msg.messageId, []);
  const res = await deployPosition({
    pool_address: d.pool.pool,
    strategy: d.strategy,
    amount_sol: d.amount_sol,
    bins_below: d.bins_below,
    bins_above: d.bins_above,
    downside_pct: d.downside_pct,
    upside_pct: d.upside_pct,
  });
  if (!res.success) {
    resetSession();
    await sendMessage(`❌ Deploy gagal: ${res.error}`);
    return mainMenu();
  }
  addPosition({
    position: res.position,
    pool: res.pool,
    pool_name: res.pool_name || d.pool.name,
    strategy: d.strategy,
    amount_sol: d.amount_sol,
    min_bin: res.bin_range.min,
    max_bin: res.bin_range.max,
    opened_at: new Date().toISOString(),
    alerted: false,
  });
  resetSession();
  const txs = (res.txs || []).map((t) => solscanTx(t)).join("\n");
  await sendMessage([
    "✅ DEPLOY SUKSES",
    `Pool: ${res.pool_name || d.pool.name}`,
    `Posisi: ${res.position}`,
    `Bins: ${res.bin_range.min} → ${res.bin_range.max} (aktif ${res.bin_range.active})`,
    `Harga: ${fmtNum(res.price_range.min, 8)} → ${fmtNum(res.price_range.max, 8)}`,
    txs ? `Tx:\n${txs}` : null,
  ].filter(Boolean).join("\n"));
  return mainMenu();
}

export function registerDeployFlow({ commandHandlers, callbackHandlers, mainMenu }) {
  commandHandlers["/deploy"] = () => askMint(null);
  callbackHandlers.push(
    { prefix: "dep", fn: (msg) => askMint(msg.messageId) },
    { prefix: "dep:pool", fn: onPool },
    { prefix: "dep:strat", fn: onStrategy },
    { prefix: "dep:amt", fn: onAmount },
    { prefix: "dep:rng", fn: onRange },
    { prefix: "dep:go", fn: (msg, arg) => onConfirm(msg, arg, mainMenu) },
  );
}
```

- [ ] **Step 2: Daftarkan di `bot.js`**

Tambahkan setelah definisi `callbackHandlers` dan sebelum `onMessage`:

```js
import { registerDeployFlow } from "./bot/deploy.js";
registerDeployFlow({ commandHandlers, callbackHandlers, mainMenu });
```

(import diletakkan di header file bersama import lain)

- [ ] **Step 3: Syntax check**

Run: `node --check bot/deploy.js; node --check bot.js`
Expected: exit 0.

- [ ] **Step 4: Uji manual flow tanpa deploy sungguhan**

Run: `node bot.js` → 🚀 Deploy → paste mint (mis. mint token apa pun yang punya pool DLMM) → verifikasi daftar pool muncul → pilih pool → strategi → amount preset → range preset → layar konfirmasi menampilkan harga aktif & cek saldo → tekan ❌ Batal. (Deploy sungguhan diuji di Task 13.)

- [ ] **Step 5: Commit**

```powershell
git add bot/deploy.js bot.js
git commit -m "feat: interactive deploy flow (mint -> pool -> strategy -> amount -> range -> confirm)"
```

---

### Task 11: Alur positions/claim/exit + auto-swap (`bot/positions.js`)

**Files:**
- Create: `bot/positions.js`
- Modify: `bot.js` (daftarkan handler)

**Interfaces:**
- Consumes: `computePositions` (engine/pnl.js); `claimFees`, `closePosition` (engine/dlmm.js); `getWalletBalances`, `swapToken`, `normalizeMint` (engine/wallet.js); `loadPositions`, `removePosition` (store.js); `getWallet` dari engine/dlmm.js ATAU engine/wallet.js (pakai engine/wallet.js).
- Produces: `registerPositionsFlow({ commandHandlers, callbackHandlers, mainMenu })`.
- Callback data: `"pos"` list; `"pos:claim:<i>"` → konfirmasi; `"pos:claim:go:<i>"`; `"pos:exit:<i>"` → konfirmasi; `"pos:exit:go:<i>"`.
- Auto-swap setelah exit: semua token wallet non-SOL dan non-USDC dengan nilai ≥ $0.50 di-swap ke SOL via `swapToken` (sesuai spec).

- [ ] **Step 1: Tulis `bot/positions.js`**

```js
import { sendMessage, sendMessageWithButtons, editMessageWithButtons } from "../telegram.js";
import { claimFees, closePosition } from "../engine/dlmm.js";
import { computePositions } from "../engine/pnl.js";
import { getWallet, getWalletBalances, swapToken } from "../engine/wallet.js";
import { loadPositions, removePosition } from "../store.js";
import { getSession, resetSession } from "./session.js";
import config from "../config.js";
import { fmtNum, fmtUsd, shortAddr, solscanTx, strategyLabel } from "./format.js";
import { log } from "../logger.js";

const MENU_ROW = [{ text: "⬅️ Menu", callback_data: "menu" }];

// Gabung PnL on-chain dengan store lokal. PnL adalah sumber kebenaran daftar posisi;
// store menambah nama/strategi dan menangkap posisi yang dibuka di luar bot.
async function buildPositionList() {
  const wallet = getWallet().publicKey.toString();
  const pnl = await computePositions(wallet);
  const stored = loadPositions();
  return (pnl.positions || []).map((p) => {
    const meta = stored.find((s) => s.position === p.position) || {};
    return { ...meta, ...p };
  });
}

function positionLine(p, i) {
  const inRange = p.in_range == null ? "?" : p.in_range ? "🟢 in-range" : "🔴 OUT";
  return [
    `${i + 1}. ${p.pool_name || shortAddr(p.pool)} ${p.strategy ? `[${strategyLabel(p.strategy)}]` : ""}`,
    `   Nilai: ${fmtUsd(p.total_value_usd ?? p.current_value_usd)} | PnL: ${fmtUsd(p.pnl_usd)} (${fmtNum(p.pnl_pct, 2)}%)`,
    `   Fees: ${fmtUsd(p.unclaimed_fees_usd ?? p.unclaimed_fee_usd)} | ${inRange}`,
  ].join("\n");
}

async function showPositions(messageId = null) {
  const list = await buildPositionList();
  const s = getSession();
  s.data.posList = list; // index dipakai callback
  if (!list.length) {
    const text = "Tidak ada posisi terbuka.";
    if (messageId) return editMessageWithButtons(text, messageId, [MENU_ROW]);
    return sendMessageWithButtons(text, [MENU_ROW]);
  }
  const text = ["📊 Posisi terbuka:", ...list.map(positionLine)].join("\n\n");
  const rows = list.map((p, i) => [
    { text: `💸 Claim ${i + 1}`, callback_data: `pos:claim:${i}` },
    { text: `🚪 Exit ${i + 1}`, callback_data: `pos:exit:${i}` },
  ]);
  rows.push(MENU_ROW);
  if (messageId) return editMessageWithButtons(text, messageId, rows);
  return sendMessageWithButtons(text, rows);
}

function getPos(i) {
  return getSession().data.posList?.[Number(i)];
}

async function confirmClaim(msg, i) {
  const p = getPos(i);
  if (!p) return sendMessage("Daftar kadaluarsa — buka 📊 Positions lagi.");
  return editMessageWithButtons(
    `Claim fees ${p.pool_name || shortAddr(p.pool)}?\nUnclaimed: ${fmtUsd(p.unclaimed_fees_usd ?? p.unclaimed_fee_usd)}`,
    msg.messageId,
    [[{ text: "✅ Claim", callback_data: `pos:claim:go:${i}` }, { text: "❌ Batal", callback_data: "pos" }]],
  );
}

async function doClaim(msg, i) {
  const p = getPos(i);
  if (!p) return sendMessage("Daftar kadaluarsa — buka 📊 Positions lagi.");
  await editMessageWithButtons("⏳ Claiming fees…", msg.messageId, []);
  const res = await claimFees({ position_address: p.position, pool_address: p.pool });
  if (!res.success) return sendMessageWithButtons(`❌ Claim gagal: ${res.error}`, [MENU_ROW]);
  const txs = (res.txs || []).map(solscanTx).join("\n");
  return sendMessageWithButtons(`✅ Fees diklaim.\n${txs}`, [MENU_ROW]);
}

async function confirmExit(msg, i) {
  const p = getPos(i);
  if (!p) return sendMessage("Daftar kadaluarsa — buka 📊 Positions lagi.");
  return editMessageWithButtons(
    [
      `⚠️ EXIT ${p.pool_name || shortAddr(p.pool)}?`,
      `Nilai: ${fmtUsd(p.total_value_usd ?? p.current_value_usd)} | PnL: ${fmtUsd(p.pnl_usd)}`,
      "Remove liquidity 100% + claim fees + close, lalu auto-swap token ke SOL.",
    ].join("\n"),
    msg.messageId,
    [[{ text: "✅ Exit", callback_data: `pos:exit:go:${i}` }, { text: "❌ Batal", callback_data: "pos" }]],
  );
}

// Swap semua token non-SOL/non-USDC bernilai >= $0.50 ke SOL.
async function sweepToSol() {
  const results = [];
  const bal = await getWalletBalances({ force: true });
  const skip = new Set([config.tokens.sol, config.tokens.usdc]);
  for (const t of bal.tokens || []) {
    const usd = Number(t.usd ?? t.total_usd ?? 0);
    if (skip.has(t.mint) || usd < 0.5 || !Number.isFinite(usd)) continue;
    try {
      const r = await swapToken({ input_mint: t.mint, output_mint: config.tokens.sol, amount: t.amount });
      results.push(`↩️ ${t.symbol || shortAddr(t.mint)} → SOL ${r?.tx ? `(${solscanTx(r.tx)})` : "OK"}`);
    } catch (e) {
      log("sweep_error", `${t.mint}: ${e.message}`);
      results.push(`⚠️ Gagal swap ${t.symbol || shortAddr(t.mint)}: ${e.message}`);
    }
  }
  return results;
}

async function doExit(msg, i) {
  const p = getPos(i);
  if (!p) return sendMessage("Daftar kadaluarsa — buka 📊 Positions lagi.");
  await editMessageWithButtons("⏳ Closing position…", msg.messageId, []);
  const res = await closePosition({ position_address: p.position, pool_address: p.pool });
  if (!res.success) return sendMessageWithButtons(`❌ Exit gagal: ${res.error}`, [MENU_ROW]);
  removePosition(p.position);
  await sendMessage("Posisi ditutup. ⏳ Auto-swap token ke SOL…");
  const sweep = await sweepToSol();
  resetSession();
  const txs = [...(res.claim_txs || []), ...(res.close_txs || [])].map(solscanTx).join("\n");
  return sendMessageWithButtons([
    "✅ EXIT SELESAI",
    `Posisi: ${shortAddr(p.position)}${res.already_closed ? " (sudah tertutup on-chain)" : ""}`,
    txs ? `Tx:\n${txs}` : null,
    sweep.length ? sweep.join("\n") : "Tidak ada token yang perlu di-swap.",
  ].filter(Boolean).join("\n"), [MENU_ROW]);
}

export function registerPositionsFlow({ commandHandlers, callbackHandlers }) {
  commandHandlers["/positions"] = () => showPositions();
  callbackHandlers.push(
    { prefix: "pos", fn: (msg) => showPositions(msg.messageId) },
    { prefix: "pos:claim", fn: confirmClaim },
    { prefix: "pos:claim:go", fn: doClaim },
    { prefix: "pos:exit", fn: confirmExit },
    { prefix: "pos:exit:go", fn: doExit },
  );
}
```

Catatan implementasi: cek bentuk field hasil `computePositions` di `engine/pnl.js` (mis. `total_value_usd` vs `current_value_usd`, `unclaimed_fees_usd` vs `unclaimed_fee_usd`, nama field pool) dan sesuaikan `positionLine`/akses field agar cocok dengan bentuk sebenarnya — pembacaan sudah ditulis defensif dengan `??`.

- [ ] **Step 2: Daftarkan di `bot.js`**

```js
import { registerPositionsFlow } from "./bot/positions.js";
registerPositionsFlow({ commandHandlers, callbackHandlers, mainMenu });
```

- [ ] **Step 3: Syntax check**

Run: `node --check bot/positions.js; node --check bot.js`
Expected: exit 0.

- [ ] **Step 4: Uji manual read-only**

Run: `node bot.js` → 📊 Positions → daftar posisi (atau "Tidak ada posisi terbuka") tampil tanpa error. Claim/Exit sungguhan diuji di Task 13.

- [ ] **Step 5: Commit**

```powershell
git add bot/positions.js bot.js
git commit -m "feat: positions list, claim, exit with auto-swap to SOL"
```

---

### Task 12: Settings flow (`bot/settings.js`)

**Files:**
- Create: `bot/settings.js`
- Modify: `bot.js` (daftarkan handler)

**Interfaces:**
- Consumes: `loadSettings`, `saveSettings` (store.js); session; telegram.
- Produces: `registerSettingsFlow({ commandHandlers, callbackHandlers })`.
- Callback data: `"set"` tampilkan; `"set:amt"` edit preset amount (input teks: angka dipisah spasi); `"set:rng"` edit preset range (input teks: pasangan `down/up` dipisah spasi, mis. `5/3 10/3 20/3`).

- [ ] **Step 1: Tulis `bot/settings.js`**

```js
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
      getSession().awaitingText = null;
      return sendMessageWithButtons("Input tidak valid — tidak ada yang diubah.", [MENU_ROW]);
    }
    const s = loadSettings();
    s.amountPresets = nums.slice(0, 4);
    saveSettings(s);
    return showSettings();
  };
  return sendMessage("Ketik preset amount baru, angka SOL dipisah spasi (maks 4), mis: `0.5 1 2`");
}

async function editRanges() {
  getSession().awaitingText = async (text) => {
    const pairs = text.trim().split(/\s+/).map((p) => {
      const m = p.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
      return m ? { down: Number(m[1]), up: Number(m[2]) } : null;
    });
    if (!pairs.length || pairs.some((p) => !p || p.down <= 0 || p.down >= 100)) {
      getSession().awaitingText = null;
      return sendMessageWithButtons("Input tidak valid — tidak ada yang diubah.", [MENU_ROW]);
    }
    const s = loadSettings();
    s.rangePresets = pairs.slice(0, 4);
    saveSettings(s);
    return showSettings();
  };
  return sendMessage("Ketik preset range baru, format `down/up` dipisah spasi (maks 4), mis: `5/3 10/3 20/3`");
}

export function registerSettingsFlow({ commandHandlers, callbackHandlers }) {
  commandHandlers["/settings"] = () => showSettings();
  callbackHandlers.push(
    { prefix: "set", fn: (msg) => showSettings(msg.messageId) },
    { prefix: "set:amt", fn: editAmounts },
    { prefix: "set:rng", fn: editRanges },
  );
}
```

- [ ] **Step 2: Daftarkan di `bot.js`**

```js
import { registerSettingsFlow } from "./bot/settings.js";
registerSettingsFlow({ commandHandlers, callbackHandlers });
```

- [ ] **Step 3: Syntax check + uji manual**

Run: `node --check bot/settings.js; node --check bot.js`
Expected: exit 0. Uji: ⚙️ Settings → edit amount `0.3 0.7` → tampilan settings ter-update; verifikasi tombol amount di alur deploy ikut berubah.

- [ ] **Step 4: Commit**

```powershell
git add bot/settings.js bot.js
git commit -m "feat: editable amount and range presets via settings flow"
```

---

### Task 13: Alert out-of-range + README + verifikasi live

**Files:**
- Modify: `bot.js` (alert loop)
- Create: `README.md`

**Interfaces:**
- Consumes: `loadPositions`, `setAlerted` (store.js); `getActiveBin` (engine/dlmm.js); `sendMessage` (telegram.js).

- [ ] **Step 1: Tambahkan alert loop di `bot.js`** (sebelum `startPolling`)

```js
import { loadPositions, setAlerted } from "./store.js";
import { getActiveBin } from "./engine/dlmm.js";

const ALERT_INTERVAL_MS = 120_000;

async function checkOutOfRange() {
  for (const p of loadPositions()) {
    try {
      const ab = await getActiveBin({ pool_address: p.pool });
      const out = ab.binId < p.min_bin || ab.binId > p.max_bin;
      if (out && !p.alerted) {
        setAlerted(p.position, true);
        await sendMessage(
          `🔴 OUT OF RANGE: ${p.pool_name}\n` +
          `Active bin ${ab.binId} di luar [${p.min_bin}, ${p.max_bin}].\n` +
          `Buka 📊 Positions untuk claim/exit. (Tidak ada aksi otomatis.)`);
      } else if (!out && p.alerted) {
        setAlerted(p.position, false);
        await sendMessage(`🟢 Kembali in-range: ${p.pool_name}`);
      }
    } catch (e) {
      log("alert_error", `${p.position}: ${e.message}`);
    }
  }
}

setInterval(() => checkOutOfRange().catch(() => null), ALERT_INTERVAL_MS);
```

Run: `node --check bot.js` → exit 0.

- [ ] **Step 2: Tulis `README.md`**

Isi: deskripsi singkat (bot DLMM manual, Telegram, strategi Spot/Bid-Ask/Curve, single-sided SOL), setup (`npm install`, salin `.env.example` → `.env`, isi token bot + chat id + wallet key + RPC), cara jalan (`npm start`, saran pm2/nssm untuk daemon), daftar command (`/menu /deploy /positions /balance /settings /cancel`), catatan keamanan (private key di `.env`, bot hanya merespons satu chat id), dan disclaimer risiko LP. Sebutkan sumber engine: repo agent user.

- [ ] **Step 3: Jalankan seluruh test + smoke**

Run: `node --test test/` → semua PASS.
Run: `npm run smoke` (dengan `.env`) → `SMOKE OK`.

- [ ] **Step 4: Verifikasi live end-to-end (BUTUH USER — amount kecil)**

Checklist untuk user (bot dijalankan `npm start`):
1. `/start` → menu muncul; 💰 Balance benar.
2. Deploy amount kecil (mis. 0.1 SOL) di pool likuid: mint → pool → Spot → amount → range -5%/+3% → konfirmasi → ✅.
3. 📊 Positions menampilkan posisi baru dengan PnL.
4. 💸 Claim (kalau ada fees) sukses.
5. 🚪 Exit → posisi tertutup, token ter-swap ke SOL, laporan tx muncul.
6. Alert out-of-range: opsional, verifikasi dengan posisi range sempit.

- [ ] **Step 5: Commit final**

```powershell
git add bot.js README.md
git commit -m "feat: out-of-range alert loop and README"
```

---

## Self-Review Checklist (sudah dijalankan)

- Spec coverage: paste-mint→pilih-pool (T10), strategi 3 pilihan (T10), amount preset editable + manual (T10, T12), range preset % + bin manual (T10, T12), single-sided SOL (T5 guard), exit + auto-swap (T11), claim manual (T11), positions+PnL (T6, T11), balance (T9), alert OOR notifikasi-saja (T13), keamanan chat id (T7), atomic JSON (T3), patch-anchor (T1), error handling try/catch router (T9).
- Placeholder: tidak ada TBD; instruksi pangkas memakai line-ref sumber eksplisit.
- Konsistensi tipe: `claimFees`/`closePosition` menerima `pool_address` eksplisit (T5) dan dipanggil demikian di T11; `bin_range.{min,max,active}` (T5) dipakai di T10/T13 (`min_bin`/`max_bin` di store).
