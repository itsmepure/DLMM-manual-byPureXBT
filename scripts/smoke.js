// Smoke test read-only: butuh RPC_URL di .env, TIDAK mengirim transaksi.
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
