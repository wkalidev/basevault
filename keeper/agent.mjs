import { CdpAgentkit } from '@coinbase/agentkit';
import { CdpToolkit } from '@coinbase/agentkit-langchain';
import { ChatGroq } from '@langchain/groq';
import { createReactAgent } from 'langchain/agents';
import { createPublicClient, http, parseAbi } from 'viem';
import { baseSepolia } from 'viem/chains';
import * as dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

// ── CONFIG ───────────────────────────────────────────────────
const VAULT_ADDRESS = '0x456996ccbdF4A958A78fE623B53C9d03eC1F9DEb';
const FACTORY       = '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24';
const WETH          = '0x4200000000000000000000000000000000000006';
const USDC          = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const RPC_URL       = process.env.BASE_SEPOLIA_RPC;

// ── ABIs ─────────────────────────────────────────────────────
const FACTORY_ABI = parseAbi([
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)',
]);
const POOL_ABI = parseAbi([
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)',
  'function tickSpacing() view returns (int24)',
]);
const VAULT_ABI = parseAbi([
  'function inPosition() view returns (bool)',
  'function tickLower() view returns (int24)',
  'function tickUpper() view returns (int24)',
  'function totalAssets() view returns (uint256)',
]);

// ── PUBLIC CLIENT ─────────────────────────────────────────────
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC_URL),
});

// ── HELPERS ──────────────────────────────────────────────────
function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function tickToPrice(tick) {
  return Math.pow(1.0001, tick);
}

// ── READ VAULT STATE ──────────────────────────────────────────
async function getVaultState() {
  // Find pool
  const poolAddress = await publicClient.readContract({
    address: FACTORY, abi: FACTORY_ABI,
    functionName: 'getPool', args: [WETH, USDC, 500],
  });

  const [slot0, inPosition, tickLower, tickUpper, totalAssets] = await Promise.all([
    publicClient.readContract({ address: poolAddress, abi: POOL_ABI, functionName: 'slot0' }),
    publicClient.readContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'inPosition' }),
    publicClient.readContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'tickLower' }),
    publicClient.readContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'tickUpper' }),
    publicClient.readContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'totalAssets' }),
  ]);

  const currentTick  = Number(slot0[1]);
  const currentPrice = tickToPrice(currentTick);
  const outOfRange   = inPosition && (currentTick < Number(tickLower) || currentTick > Number(tickUpper));

  return {
    poolAddress,
    currentTick,
    currentPrice: currentPrice.toFixed(8),
    inPosition,
    tickLower: Number(tickLower),
    tickUpper: Number(tickUpper),
    totalAssets: (Number(totalAssets) / 1e18).toFixed(6),
    outOfRange,
    status: !inPosition ? 'IDLE' : outOfRange ? 'OUT_OF_RANGE' : 'IN_RANGE',
  };
}

// ── INIT AGENTKIT ─────────────────────────────────────────────
async function initAgent() {
  log('🔧 Initializing AgentKit...');

  // CDP AgentKit — uses CDP wallet for onchain actions
  const agentkit = await CdpAgentkit.configureWithWallet({
    cdpApiKeyName:       process.env.CDP_API_KEY_NAME,
    cdpApiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    networkId: 'base-sepolia',
  });

  // Groq LLM — free & ultra fast
  const llm = new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model:  'llama-3.3-70b-versatile',
    temperature: 0,
  });

  // CDP Toolkit — gives agent onchain tools
  const cdpToolkit = new CdpToolkit(agentkit);
  const tools      = cdpToolkit.getTools();

  // Create ReAct agent
  const agent = createReactAgent({ llm, tools });

  log('✅ GhostAgent initialized');
  log(`   LLM: Groq Llama 3.3 70B`);
  log(`   Network: Base Sepolia`);
  log(`   Tools: ${tools.length} onchain actions available`);

  return { agent, agentkit };
}

// ── AGENT ANALYSIS LOOP ───────────────────────────────────────
async function analyzeAndAct(agent) {
  try {
    const state = await getVaultState();

    log(`\n👻 GhostAgent Analysis:`);
    log(`   Status:     ${state.status}`);
    log(`   Price:      ${state.currentPrice}`);
    log(`   Tick:       ${state.currentTick}`);
    log(`   In range:   [${state.tickLower}, ${state.tickUpper}]`);
    log(`   TVL:        ${state.totalAssets} ETH`);

    // Build prompt for the agent
    const prompt = `
You are GhostAgent, an AI security monitor for the BaseVault DeFi protocol on Base Sepolia.

Current vault state:
- Status: ${state.status}
- Current tick: ${state.currentTick}
- Current price: ${state.currentPrice} (WETH/USDC ratio)
- In position: ${state.inPosition}
- Tick range: [${state.tickLower}, ${state.tickUpper}]
- Total assets: ${state.totalAssets} ETH
- Out of range: ${state.outOfRange}
- Pool address: ${state.poolAddress}
- Vault address: ${VAULT_ADDRESS}

Your task:
1. Analyze the current state of the vault
2. Identify any security risks or opportunities
3. Provide a concise security report (3-5 sentences)
4. Rate the overall risk: LOW / MEDIUM / HIGH
5. Recommend next action: MONITOR / REBALANCE / EMERGENCY_WITHDRAW

Be precise and professional. Focus on DeFi security.
`;

    log('\n🤖 Asking Groq LLM to analyze...');

    const response = await agent.invoke({
      messages: [{ role: 'user', content: prompt }],
    });

    const lastMessage = response.messages[response.messages.length - 1];
    const analysis    = lastMessage.content;

    log('\n📊 GhostAgent Report:');
    log('─'.repeat(50));
    console.log(analysis);
    log('─'.repeat(50));

    // Extract risk level from response
    if (analysis.includes('HIGH')) {
      log('⚠️  HIGH RISK detected — manual review recommended');
    } else if (analysis.includes('MEDIUM')) {
      log('⚡ MEDIUM risk — monitoring closely');
    } else {
      log('✅ LOW risk — vault operating normally');
    }

  } catch (err) {
    log(`❌ Analysis error: ${err.message}`);
  }
}

// ── MAIN ──────────────────────────────────────────────────────
async function main() {
  log('👻 GhostAgent AI Security Bot starting...');
  log(`   Vault:   ${VAULT_ADDRESS}`);
  log(`   Network: Base Sepolia`);
  log('─'.repeat(50));

  const { agent } = await initAgent();

  // Run analysis immediately then every 5 minutes
  await analyzeAndAct(agent);
  setInterval(() => analyzeAndAct(agent), 5 * 60 * 1000);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
