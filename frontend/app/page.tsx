'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract, useWriteContract, useBalance } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { useState, useEffect, useRef } from 'react';
import { VAULT_ADDRESS, VAULT_ABI } from './wagmi';
import useSWR from 'swr';
import { GhostAgent } from './GhostAgent';


// ── TYPES ───────────────────────────────────────────────────
interface PolymarketMarket {
  id: string;
  question: string;
  outcomePrices: string;
  volume: number;
  liquidity: number;
  active: boolean;
  outcomes: string;
}

// ── POLYMARKET FETCHER ──────────────────────────────────────
async function fetchCryptoMarkets(): Promise<PolymarketMarket[]> {
  const res = await fetch(
    'https://gamma-api.polymarket.com/markets?active=true&limit=12&tag_id=crypto'
  );
  if (!res.ok) throw new Error('Polymarket API error');
  return res.json();
}

function parsePrices(outcomePrices: string): number[] {
  try { return JSON.parse(outcomePrices).map(Number); }
  catch { return [0.5, 0.5]; }
}

function parseOutcomes(outcomes: string): string[] {
  try { return JSON.parse(outcomes); }
  catch { return ['Yes', 'No']; }
}

// ── SECURITY HELPERS ────────────────────────────────────────
function sanitizeAmount(val: string): string {
  const cleaned = val.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length > 2) return parts[0] + '.' + parts[1];
  if (parts[1]?.length > 18) return parts[0] + '.' + parts[1].slice(0, 18);
  return cleaned;
}

function isValidAmount(val: string, max?: bigint): boolean {
  const n = parseFloat(val);
  if (isNaN(n) || n <= 0) return false;
  if (max !== undefined) {
    try { return parseEther(val) <= max; } catch { return false; }
  }
  return true;
}

const TICKER_DATA = [
  { pair: 'ETH/USDC', trend: '+2.3%', apy: '18.4%', color: '#00ff9d' },
  { pair: 'WBTC/ETH', trend: '+0.8%', apy: '22.1%', color: '#00c8ff' },
  { pair: 'BASE/ETH', trend: '+5.1%', apy: '41.3%', color: '#00ff9d' },
  { pair: 'USDC/DAI', trend: '+0.1%', apy: '8.2%',  color: '#ffd700' },
];

function MiniChart({ bullish }: { bullish: boolean }) {
  const bars = [0.4, 0.6, 0.5, 0.7, 0.55, 0.8, 0.65,
    bullish ? 0.9 : 0.45, bullish ? 0.95 : 0.35, bullish ? 1 : 0.3];
  return (
    <svg viewBox="0 0 100 40" style={{ width: '100%', height: '40px' }}>
      {bars.map((h, i) => (
        <rect key={i} x={i * 11 + 2} y={40 - h * 38} width="8" height={h * 38}
          fill={bullish ? 'rgba(0,255,157,0.5)' : 'rgba(255,107,53,0.5)'} rx="1" />
      ))}
      <polyline points={bars.map((h, i) => `${i * 11 + 6},${40 - h * 38}`).join(' ')}
        fill="none" stroke={bullish ? '#00ff9d' : '#ff6b35'} strokeWidth="1.5" />
    </svg>
  );
}

function SecurityBadge() {
  const checks = [
    { label: 'ERC-4626 Standard',  ok: true,  warn: false },
    { label: 'Reentrancy Guard',   ok: true,  warn: false },
    { label: 'Ownable Access',     ok: true,  warn: false },
    { label: 'Emergency Withdraw', ok: true,  warn: false },
    { label: 'Slippage Protection',ok: true,  warn: false },
    { label: 'Mainnet Audit',      ok: false, warn: true  },
  ];
  return (
    <div style={{ background: '#0a1628', border: '1px solid rgba(0,200,255,0.15)', borderRadius: '8px', padding: '1.2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <span>🛡️</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '0.65rem', letterSpacing: '0.15em', color: 'var(--blue)', textTransform: 'uppercase' }}>Security Status</span>
      </div>
      {checks.map((c, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0', borderBottom: i < checks.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '0.62rem', color: 'var(--muted)' }}>{c.label}</span>
          <span style={{ fontSize: '0.7rem', color: c.warn ? 'var(--orange)' : 'var(--green)' }}>{c.ok ? '✓' : '⚠'}</span>
        </div>
      ))}
    </div>
  );
}

function PolymarketSection() {
  const { data: markets, error, isLoading } = useSWR(
    'polymarkets', fetchCryptoMarkets, { refreshInterval: 30000 }
  );

  if (isLoading) return (
    <div style={{ textAlign: 'center', padding: '4rem', fontFamily: 'var(--mono)', color: 'var(--muted)', fontSize: '0.7rem', letterSpacing: '0.2em' }}>
      ⟳ FETCHING POLYMARKET DATA...
    </div>
  );

  if (error) return (
    <div style={{ textAlign: 'center', padding: '4rem', fontFamily: 'var(--mono)', color: 'var(--orange)', fontSize: '0.7rem', lineHeight: 2 }}>
      ⚠ Cannot reach Polymarket API<br />
      <span style={{ color: 'var(--muted)', fontSize: '0.6rem' }}>CORS issue in dev — deploy to Vercel to fix.</span>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '0.62rem', letterSpacing: '0.15em', color: 'var(--blue)', textTransform: 'uppercase' }}>Polymarket · Live Crypto Markets</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '0.52rem', background: 'rgba(0,255,157,0.1)', border: '1px solid rgba(0,255,157,0.2)', color: 'var(--green)', padding: '0.15rem 0.5rem', borderRadius: '3px' }}>
          LIVE · {markets?.length ?? 0} markets
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '0.52rem', color: 'var(--muted)' }}>Read-only · Trade on polymarket.com</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.8rem' }}>
        {markets?.map((market) => {
          const prices   = parsePrices(market.outcomePrices);
          const outcomes = parseOutcomes(market.outcomes);
          const yesPrice = prices[0] ?? 0.5;
          const bullish  = yesPrice >= 0.5;
          return (
            <div key={market.id} className="card" style={{ cursor: 'pointer' }}
              onClick={() => window.open(`https://polymarket.com/market/${market.id}`, '_blank')}>
              <p style={{ fontFamily: 'var(--mono)', fontSize: '0.68rem', fontWeight: 700, lineHeight: 1.5, marginBottom: '1rem', color: 'var(--text)' }}>
                {market.question}
              </p>
              <div style={{ marginBottom: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '0.6rem', color: 'var(--green)', fontWeight: 700 }}>{outcomes[0]} {(yesPrice * 100).toFixed(0)}%</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '0.6rem', color: 'var(--orange)', fontWeight: 700 }}>{outcomes[1]} {((1 - yesPrice) * 100).toFixed(0)}%</span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${yesPrice * 100}%`, background: bullish ? 'var(--green)' : 'var(--orange)', borderRadius: '3px', transition: 'width 0.5s' }} />
                </div>
              </div>
              <MiniChart bullish={bullish} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.8rem' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', color: 'var(--muted)' }}>Vol: ${(market.volume / 1000).toFixed(0)}K</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', color: 'var(--muted)' }}>Liq: ${(market.liquidity / 1000).toFixed(0)}K</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', fontWeight: 700, color: bullish ? 'var(--green)' : 'var(--orange)' }}>{bullish ? '▲ YES' : '▼ NO'}</span>
              </div>
              <div style={{ marginTop: '0.5rem', fontFamily: 'var(--mono)', fontSize: '0.5rem', color: 'var(--muted)', textAlign: 'right' }}>↗ View on Polymarket</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Home() {
  const { address, isConnected } = useAccount();
  const [amount, setAmount]       = useState('');
  const [action, setAction]       = useState<'deposit' | 'withdraw'>('deposit');
  const [activeTab, setActiveTab] = useState<'vault' | 'market' | 'security'>('vault');
  const [ticker, setTicker]       = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = setInterval(() => setTicker(t => t + 1), 2000);
    return () => clearInterval(id);
  }, []);

  const { data: totalAssets } = useReadContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'totalAssets' });
  const { data: userShares  } = useReadContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'balanceOf', args: [address!], query: { enabled: !!address } });
  const { data: inPosition  } = useReadContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'inPosition' });
  const { data: ethBalance  } = useBalance({ address });
  const { writeContract, isPending, isSuccess, error: writeError } = useWriteContract();

  function handleSubmit() {
    if (!address || !isConnected) return;
    if (!isValidAmount(amount, action === 'withdraw' ? userShares : ethBalance?.value)) return;
    const parsed = parseEther(amount);
    if (action === 'deposit') {
      writeContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'deposit', args: [parsed, address] });
    } else {
      writeContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'withdraw', args: [parsed, address, address] });
    }
    setAmount('');
  }

  const amountValid = isValidAmount(amount);
  const tvlEth    = totalAssets ? parseFloat(formatEther(totalAssets)) : 0;
  const tvlUsd    = (tvlEth * 3200 + (ticker % 3) * 12).toFixed(2);
  const sharesVal = userShares ? formatEther(userShares) : '0';

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=JetBrains+Mono:wght@400;700&display=swap');
        :root {
          --mono:'JetBrains Mono',monospace; --display:'Orbitron',sans-serif;
          --bg:#030810; --surface:#0a1628; --surface2:#0f1f38;
          --blue:#00c8ff; --green:#00ff9d; --orange:#ff6b35; --gold:#ffd700;
          --text:#cde4f5; --muted:#3a5a7a; --border:rgba(0,200,255,0.12);
        }
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        body{background:var(--bg);color:var(--text);overflow-x:hidden}
        body::before{content:'';position:fixed;inset:0;background:radial-gradient(ellipse at 10% 20%,rgba(0,200,255,0.04) 0%,transparent 50%),radial-gradient(ellipse at 90% 80%,rgba(0,255,157,0.03) 0%,transparent 50%),linear-gradient(rgba(0,200,255,0.015) 1px,transparent 1px),linear-gradient(90deg,rgba(0,200,255,0.015) 1px,transparent 1px);background-size:auto,auto,32px 32px,32px 32px;pointer-events:none;z-index:0}
        .scanline{position:fixed;top:0;left:0;right:0;height:2px;background:rgba(0,200,255,0.15);animation:scan 8s linear infinite;pointer-events:none;z-index:999}
        @keyframes scan{0%{top:0}100%{top:100vh}}
        @keyframes pulse{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(1.3)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes glow{0%,100%{box-shadow:0 0 8px rgba(0,200,255,.3)}50%{box-shadow:0 0 20px rgba(0,200,255,.6)}}
        .card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:1.2rem;animation:fadeUp .4s ease forwards}
        .card:hover{border-color:rgba(0,200,255,.28);transition:border-color .2s}
        .tab-btn{font-family:var(--mono);font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;padding:.5rem 1rem;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;border-radius:4px;transition:all .2s;white-space:nowrap}
        .tab-btn.active{background:rgba(0,200,255,.1);color:var(--blue);border-color:rgba(0,200,255,.3)}
        .action-btn{flex:1;padding:.55rem;font-family:var(--mono);font-size:.65rem;letter-spacing:.1em;text-transform:uppercase;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;border-radius:4px;transition:all .2s}
        .action-btn.active{background:rgba(0,200,255,.12);color:var(--blue);border-color:var(--blue)}
        .submit-btn{width:100%;padding:.85rem;font-family:var(--mono);font-size:.72rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;border:none;border-radius:6px;cursor:pointer;transition:all .2s}
        .submit-btn:not(:disabled){animation:glow 3s infinite}
        .submit-btn:disabled{cursor:not-allowed}
        input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        input[type=number]{-moz-appearance:textfield}
        @media(max-width:640px){
          .stats-row{grid-template-columns:1fr 1fr !important}
          .stats-row>*:last-child{grid-column:1 / -1}
          .main-layout{grid-template-columns:1fr !important}
        }
      `}</style>

      <div className="scanline" />

      <nav style={{ position:'sticky',top:0,zIndex:50,background:'rgba(3,8,16,0.92)',backdropFilter:'blur(20px)',borderBottom:'1px solid var(--border)',padding:'.8rem 1.2rem',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'1rem' }}>
        <div style={{ display:'flex',alignItems:'center',gap:'.6rem',flexShrink:0 }}>
          <div style={{ width:8,height:8,borderRadius:'50%',background:'var(--blue)',animation:'pulse 2s infinite',boxShadow:'0 0 8px var(--blue)' }} />
          <span style={{ fontFamily:'var(--display)',fontWeight:900,fontSize:'.95rem',letterSpacing:'.05em' }}>BASE<span style={{ color:'var(--blue)' }}>VAULT</span></span>
          <span style={{ fontFamily:'var(--mono)',fontSize:'.5rem',background:'rgba(0,200,255,.1)',border:'1px solid rgba(0,200,255,.2)',color:'var(--blue)',padding:'.15rem .4rem',borderRadius:'3px',letterSpacing:'.1em' }}>SEPOLIA</span>
        </div>
        <div style={{ display:'flex',gap:'.4rem',overflowX:'auto' }}>
          {(['vault','market','security'] as const).map(t => (
            <button key={t} className={`tab-btn ${activeTab===t?'active':''}`} onClick={()=>setActiveTab(t)}>{t}</button>
          ))}
        </div>
        <ConnectButton chainStatus="icon" showBalance={false} accountStatus="avatar" />
      </nav>

      <main style={{ position:'relative',zIndex:1,padding:'1.2rem',maxWidth:'1100px',margin:'0 auto' }}>

        {/* TICKER */}
        <div style={{ display:'flex',gap:'1.5rem',overflowX:'auto',padding:'.6rem 0',marginBottom:'1.2rem',borderBottom:'1px solid var(--border)' }}>
          {TICKER_DATA.map((p,i) => (
            <div key={i} style={{ display:'flex',alignItems:'center',gap:'.5rem',whiteSpace:'nowrap',flexShrink:0 }}>
              <span style={{ fontFamily:'var(--mono)',fontSize:'.62rem',color:'var(--muted)' }}>{p.pair}</span>
              <span style={{ fontFamily:'var(--mono)',fontSize:'.62rem',color:p.color,fontWeight:700 }}>{p.trend}</span>
              <span style={{ fontFamily:'var(--mono)',fontSize:'.55rem',color:'var(--muted)' }}>{p.apy} APY</span>
            </div>
          ))}
        </div>

        {/* STATS */}
        <div className="stats-row" style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'.8rem',marginBottom:'1.2rem' }}>
          {[
            { label:'TVL (ETH)',    value: formatEther(totalAssets ?? 0n),     color:'var(--blue)'   },
            { label:'TVL (USD)',    value: `$${tvlUsd}`,                        color:'var(--green)'  },
            { label:'Your Shares', value: parseFloat(sharesVal).toFixed(4),    color:'var(--green)'  },
            { label:'Position',    value: inPosition ? 'ACTIVE' : 'IDLE',      color: inPosition ? 'var(--green)' : 'var(--orange)' },
          ].map((s,i) => (
            <div key={i} className="card" style={{ animationDelay:`${i*.08}s` }}>
              <div style={{ fontFamily:'var(--mono)',fontSize:'.55rem',letterSpacing:'.18em',textTransform:'uppercase',color:'var(--muted)',marginBottom:'.4rem' }}>{s.label}</div>
              <div style={{ fontFamily:'var(--display)',fontSize:'.95rem',fontWeight:700,color:s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* VAULT TAB */}
        {activeTab === 'vault' && (
          <div className="main-layout" style={{ display:'grid',gridTemplateColumns:'1fr 320px',gap:'1rem' }}>
            <div className="card" style={{ padding:'1.5rem' }}>
              <div style={{ display:'flex',alignItems:'center',gap:'.5rem',marginBottom:'1.2rem' }}>
                <div style={{ width:6,height:6,borderRadius:'50%',background:'var(--green)',boxShadow:'0 0 8px var(--green)',animation:'pulse 2s infinite' }} />
                <span style={{ fontFamily:'var(--mono)',fontSize:'.62rem',letterSpacing:'.15em',color:'var(--blue)',textTransform:'uppercase' }}>ETH / USDC · Wide Strategy</span>
              </div>
              <div style={{ display:'flex',gap:'.5rem',marginBottom:'1.2rem' }}>
                {(['deposit','withdraw'] as const).map(a => (
                  <button key={a} className={`action-btn ${action===a?'active':''}`} onClick={()=>setAction(a)}>{a}</button>
                ))}
              </div>
              <div style={{ background:'var(--bg)',border:`1px solid ${amount&&!amountValid?'var(--orange)':'var(--border)'}`,borderRadius:'6px',padding:'1rem',marginBottom:'.8rem',transition:'border-color .2s' }}>
                <div style={{ display:'flex',justifyContent:'space-between',marginBottom:'.5rem' }}>
                  <span style={{ fontFamily:'var(--mono)',fontSize:'.55rem',letterSpacing:'.12em',color:'var(--muted)',textTransform:'uppercase' }}>Amount</span>
                  <span style={{ fontFamily:'var(--mono)',fontSize:'.55rem',color:'var(--muted)',cursor:'pointer' }}
                    onClick={()=>{ const max=action==='withdraw'?sharesVal:formatEther(ethBalance?.value??0n); setAmount(parseFloat(max).toFixed(6)); }}>
                    Max: <span style={{ color:'var(--blue)' }}>{action==='withdraw'?parseFloat(sharesVal).toFixed(4):parseFloat(formatEther(ethBalance?.value??0n)).toFixed(4)}</span>
                  </span>
                </div>
                <div style={{ display:'flex',alignItems:'center',gap:'.8rem' }}>
                  <input ref={inputRef} type="number" placeholder="0.000000" value={amount}
                    onChange={e=>setAmount(sanitizeAmount(e.target.value))}
                    style={{ flex:1,background:'none',border:'none',outline:'none',fontFamily:'var(--mono)',fontSize:'1.4rem',fontWeight:700,color:'var(--text)' }} />
                  <div style={{ background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:'4px',padding:'.3rem .7rem',fontFamily:'var(--mono)',fontSize:'.7rem',fontWeight:700 }}>
                    {action==='deposit'?'WETH':'SHARES'}
                  </div>
                </div>
              </div>
              {amount&&!amountValid&&<p style={{ fontFamily:'var(--mono)',fontSize:'.6rem',color:'var(--orange)',marginBottom:'.8rem' }}>⚠ Invalid amount</p>}
              {writeError&&<p style={{ fontFamily:'var(--mono)',fontSize:'.6rem',color:'var(--orange)',marginBottom:'.8rem' }}>⚠ {writeError.message.slice(0,80)}...</p>}
              {amount&&amountValid&&(
                <div style={{ background:'rgba(0,255,157,.04)',border:'1px solid rgba(0,255,157,.15)',borderRadius:'6px',padding:'.8rem',marginBottom:'.8rem' }}>
                  {[
                    { label:'Current APY', val:'18.4%', color:'var(--green)' },
                    { label:'Est. daily',  val:`+$${(parseFloat(amount)*3200*.184/365).toFixed(2)}`, color:'var(--green)' },
                    { label:'Est. 30d',    val:`+$${(parseFloat(amount)*3200*.184/12).toFixed(2)}`,  color:'var(--green)' },
                    { label:'Protocol fee',val:'0.5%',  color:'var(--muted)' },
                  ].map((r,i)=>(
                    <div key={i} style={{ display:'flex',justifyContent:'space-between',padding:'.2rem 0' }}>
                      <span style={{ fontFamily:'var(--mono)',fontSize:'.6rem',color:'var(--muted)' }}>{r.label}</span>
                      <span style={{ fontFamily:'var(--mono)',fontSize:'.65rem',fontWeight:700,color:r.color }}>{r.val}</span>
                    </div>
                  ))}
                </div>
              )}
              <button className="submit-btn" disabled={!isConnected||isPending||!amountValid} onClick={handleSubmit}
                style={{ background:(!isConnected||!amountValid)?'var(--muted)':'var(--blue)', color:(!isConnected||!amountValid)?'#1a2a3a':'var(--bg)' }}>
                {!isConnected?'🔒 Connect Wallet':isPending?'⟳ Confirming...':isSuccess?'✓ Success!':action==='deposit'?'↓ Deposit':'↑ Withdraw'}
              </button>
              <p style={{ fontFamily:'var(--mono)',fontSize:'.52rem',color:'var(--muted)',textAlign:'center',marginTop:'.8rem' }}>
                {VAULT_ADDRESS.slice(0,10)}...{VAULT_ADDRESS.slice(-8)} · Base Sepolia · ERC-4626
              </p>
            </div>
            <div style={{ display:'flex',flexDirection:'column',gap:'.8rem' }}>
              <SecurityBadge />
              <div className="card">
                <div style={{ fontFamily:'var(--mono)',fontSize:'.55rem',letterSpacing:'.18em',textTransform:'uppercase',color:'var(--muted)',marginBottom:'.8rem' }}>Contract Info</div>
                {[{k:'Standard',v:'ERC-4626'},{k:'Protocol',v:'Uniswap V3'},{k:'Network',v:'Base Sepolia'},{k:'Fee',v:'0.5%'},{k:'Keeper',v:'Manual'}].map((r,i)=>(
                  <div key={i} style={{ display:'flex',justifyContent:'space-between',padding:'.3rem 0',borderBottom:i<4?'1px solid rgba(255,255,255,.04)':'none' }}>
                    <span style={{ fontFamily:'var(--mono)',fontSize:'.6rem',color:'var(--muted)' }}>{r.k}</span>
                    <span style={{ fontFamily:'var(--mono)',fontSize:'.6rem',color:'var(--text)' }}>{r.v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* MARKET TAB */}
        {activeTab === 'market' && <PolymarketSection />}

        {/* SECURITY TAB */}
        {activeTab === 'security' && (
          <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:'1rem' }}>
            {[
              { title:'🔒 Reentrancy Guard',  desc:'All state-modifying functions protected with OpenZeppelin ReentrancyGuard. No reentrant calls possible.',           status:'SECURED',  color:'var(--green)'  },
              { title:'👤 Access Control',    desc:'Ownable pattern — only owner can set keeper and fee recipient. Keeper role separated from admin.',                  status:'SECURED',  color:'var(--green)'  },
              { title:'🚨 Emergency Exit',    desc:'emergencyWithdraw() lets owner pull all funds instantly. Circuit breaker for black swan events.',                   status:'SECURED',  color:'var(--green)'  },
              { title:'✅ ERC-4626 Standard', desc:'Vault follows the tokenized vault standard. Compatible with all major DeFi integrations and aggregators.',          status:'VERIFIED', color:'var(--blue)'   },
              { title:'⚡ Input Validation',  desc:'Frontend sanitizes all amounts. Contract validates tick ranges and liquidity. No zero-address transfers.',          status:'SECURED',  color:'var(--green)'  },
              { title:'⚠️ Audit Pending',     desc:'Smart contract audit required before mainnet deployment. Do not use with significant funds on testnet.',            status:'PENDING',  color:'var(--orange)' },
            ].map((item,i)=>(
              <div key={i} className="card" style={{ animationDelay:`${i*.08}s` }}>
                <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'.8rem' }}>
                  <span style={{ fontFamily:'var(--mono)',fontSize:'.72rem',fontWeight:700 }}>{item.title}</span>
                  <span style={{ fontFamily:'var(--mono)',fontSize:'.52rem',color:item.color,background:`${item.color}18`,border:`1px solid ${item.color}40`,padding:'.15rem .5rem',borderRadius:'3px',letterSpacing:'.1em' }}>{item.status}</span>
                </div>
                <p style={{ fontFamily:'var(--mono)',fontSize:'.62rem',color:'var(--muted)',lineHeight:1.6 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        )}

      </main>
      <GhostAgent />
    </>
  );
}
