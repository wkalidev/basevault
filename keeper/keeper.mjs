import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import * as dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

// ── CONFIG ───────────────────────────────────────────────────
const VAULT_ADDRESS = '0x456996ccbdF4A958A78fE623B53C9d03eC1F9DEb';
const FACTORY       = '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24';
const WETH          = '0x4200000000000000000000000000000000000006';
const USDC          = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const RPC_URL       = process.env.BASE_SEPOLIA_RPC;
const PRIVATE_KEY   = process.env.PRIVATE_KEY;

// Fee tiers to try in order
const FEE_TIERS = [500, 3000, 10000];

// ── ABIs ─────────────────────────────────────────────────────
const FACTORY_ABI = parseAbi([
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)',
]);

const POOL_ABI = parseAbi([
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function tickSpacing() view returns (int24)',
]);

const VAULT_ABI = parseAbi([
  'function rebalance(int24 newTickLower, int24 newTickUpper) external',
  'function inPosition() view returns (bool)',
  'function tickLower() view returns (int24)',
  'function tickUpper() view returns (int24)',
]);

// ── CLIENTS ──────────────────────────────────────────────────
const account = privateKeyToAccount(PRIVATE_KEY);

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC_URL),
});

const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(RPC_URL),
});

// ── HELPERS ──────────────────────────────────────────────────
function tickToPrice(tick) {
  return Math.pow(1.0001, tick);
}

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ── FIND POOL ─────────────────────────────────────────────────
async function findPool() {
  for (const fee of FEE_TIERS) {
    const poolAddress = await publicClient.readContract({
      address: FACTORY,
      abi: FACTORY_ABI,
      functionName: 'getPool',
      args: [WETH, USDC, fee],
    });

    if (poolAddress !== '0x0000000000000000000000000000000000000000') {
      log(`✓ Pool found: ${poolAddress} (fee: ${fee / 10000}%)`);
      return { poolAddress, fee };
    }
    log(`  Fee ${fee / 10000}% — no pool`);
  }
  return null;
}

// ── MAIN LOOP ────────────────────────────────────────────────
async function checkAndRebalance() {
  try {
    // 0. Find pool dynamically
    const result = await findPool();
    if (!result) {
      log('❌ No WETH/USDC pool found on Base Sepolia — skipping');
      return;
    }
    const { poolAddress } = result;

    // 1. Read current tick from pool
    const slot0 = await publicClient.readContract({
      address: poolAddress,
      abi: POOL_ABI,
      functionName: 'slot0',
    });
    const currentTick  = slot0[1];
    const currentPrice = tickToPrice(currentTick);

    // 2. Read vault state
    const inPosition = await publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'inPosition',
    });

    log(`Tick: ${currentTick} | Price: ${currentPrice.toFixed(6)} | In position: ${inPosition}`);

    if (!inPosition) {
      log('ℹ Vault not in position — skipping rebalance');
      return;
    }

    // 3. Read current vault tick range
    const [tickLower, tickUpper] = await Promise.all([
      publicClient.readContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'tickLower' }),
      publicClient.readContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'tickUpper' }),
    ]);

    log(`Range: [${tickLower}, ${tickUpper}]`);

    // 4. Check if out of range
    const outOfRange = currentTick < Number(tickLower) || currentTick > Number(tickUpper);

    if (!outOfRange) {
      log('✓ Price in range — no rebalance needed');
      return;
    }

    log('⚠ Price OUT OF RANGE — triggering rebalance...');

    // 5. Calculate new range centered on current tick
    const tickSpacing = await publicClient.readContract({
      address: poolAddress,
      abi: POOL_ABI,
      functionName: 'tickSpacing',
    });

    const RANGE_TICKS  = 4000;
    const spacing      = Number(tickSpacing);
    const roundedLower = Math.floor((currentTick - RANGE_TICKS) / spacing) * spacing;
    const roundedUpper = Math.ceil((currentTick + RANGE_TICKS) / spacing) * spacing;

    log(`New range: [${roundedLower}, ${roundedUpper}]`);

    // 6. Call rebalance()
    const hash = await walletClient.writeContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'rebalance',
      args: [roundedLower, roundedUpper],
    });

    log(`✅ Rebalance tx: ${hash}`);
    log(`   https://sepolia.basescan.org/tx/${hash}`);

  } catch (err) {
    log(`❌ Error: ${err.message}`);
  }
}

// ── START ─────────────────────────────────────────────────────
log('👻 GhostKeeper Bot started');
log(`   Vault:    ${VAULT_ADDRESS}`);
log(`   Keeper:   ${account.address}`);
log(`   Network:  Base Sepolia`);
log(`   Interval: 60s`);
log('─────────────────────────────────────────────');

checkAndRebalance();
setInterval(checkAndRebalance, 60_000);
