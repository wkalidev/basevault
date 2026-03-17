import {
  AgentKit,
  CdpEvmWalletProvider,
  erc20ActionProvider,
  cdpEvmWalletActionProvider,
} from '@coinbase/agentkit';
import { getLangChainTools } from '@coinbase/agentkit-langchain';
import { ChatGroq } from '@langchain/groq';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { HumanMessage } from '@langchain/core/messages';
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

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function tickToPrice(tick) {
  return Math.pow(1.0001, tick);
}

// ── READ VAULT STATE ──────────────────────────────────────────
async function getVaultState() {
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

  const walletProvider = await CdpEvmWalletProvider.configureWithWallet({
    apiKeyId:     process.env.CDP_API_KEY_NAME,
    apiKeySecret: process.env.CDP_API_KEY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    networkId:    'base-sepolia',
  });

  const agentkit = await AgentKit.from({
    walletProvider,
    actionProviders: [
      cdpEvmWalletActionProvider(),
      erc20ActionProvider(),
    ],
  });

  const tools = getLangChainTools(agentkit);

  const llm = new ChatGroq({
    apiKey:      process.env.GROQ_API_KEY,
    model:       'llama-3.3-70b-versatile',
    temperature: 0,
  });

  const agent = createReactAgent({ llm, tools });

  const walletAddress = await walletProvider.getAddress();
  log(`✅ GhostAgent initialized`);
  log(`   Wallet:  ${walletAddress}`);
  log(`   LLM:     Groq Llama 3.3 70B`);
  log(`   Tools:   ${tools.length} onchain actions`);

  return agent;
}

// ── ANALYSIS LOOP ─────────────────────────────────────────────
async function analyzeAndAct(agent) {
  try {
    const state = await getVaultState();

    log(`\n👻 Vault State:`);
    log(`   Status:  ${state.status}`);
    log(`   Price:   ${state.currentPrice}`);
    log(`   TVL:     ${state.totalAssets} ETH`);
    log(`   Range:   [${state.tickLower}, ${state.tickUpper}]`);

    const prompt = `
You are GhostAgent, an AI security monitor for BaseVault — a DeFi yield vault on Base Sepolia.

Current vault state:
- Status: ${state.status}
- Current tick: ${state.currentTick}
- Current price: ${state.currentPrice}
- In position: ${state.inPosition}
- Tick range: [${state.tickLower}, ${state.tickUpper}]
- Total assets: ${state.totalAssets} ETH
- Out of range: ${state.outOfRange}
- Vault: ${VAULT_ADDRESS}

Analyze the vault security and performance. Provide:
1. Security assessment (2-3 sentences)
2. Risk level: LOW / MEDIUM / HIGH
3. Recommended action: MONITOR / REBALANCE / ALERT

Be concise and precise.
`;

    log('\n🤖 Analyzing with Groq Llama 3.3...');

    const response = await agent.invoke({
      messages: [new HumanMessage(prompt)],
    });

    const last     = response.messages[response.messages.length - 1];
    const analysis = last.content;

    log('\n📊 GhostAgent Security Report:');
    log('─'.repeat(50));
    console.log(analysis);
    log('─'.repeat(50));

  } catch (err) {
    log(`❌ Error: ${err.message}`);
  }
}

// ── MAIN ──────────────────────────────────────────────────────
async function main() {
  log('👻 GhostAgent AI Security Bot starting...');
  log(`   Vault:   ${VAULT_ADDRESS}`);
  log(`   Network: Base Sepolia`);
  log('─'.repeat(50));

  const agent = await initAgent();

  await analyzeAndAct(agent);
  setInterval(() => analyzeAndAct(agent), 5 * 60 * 1000);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
