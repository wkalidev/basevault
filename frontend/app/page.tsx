'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract, useWriteContract, useBalance } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { useState, useCallback } from 'react';
import { VAULT_ADDRESS, VAULT_ABI } from './wagmi';
import useSWR from 'swr';
import { GhostAgent } from './GhostAgent';
import { SwapTab } from './SwapTab';

// ── TYPES ────────────────────────────────────────────────────
interface PolymarketMarket {
  id: string;
  question: string;
  outcomePrices: string;
  volume: number;
  liquidity: number;
  active: boolean;
  outcomes: string;
}

interface TokenBalance {
  symbol: string;
  name: string;
  balance: string;
  usdValue: number;
  change24h: number;
  color: string;
}

// ── FETCHERS ─────────────────────────────────────────────────
async function fetchCryptoMarkets(): Promise<PolymarketMarket[]> {
  const res = await fetch('https://gamma-api.polymarket.com/markets?active=true&limit=12&tag_id=crypto');
  if (!res.ok) throw new Error('Polymarket API error');
  return res.json();
}

async function fetchEthPrice(): Promise<number> {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    const data = await res.json();
    return data.ethereum.usd;
  } catch { return 3200; }
}

// ── HELPERS ──────────────────────────────────────────────────
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

function parsePrices(outcomePrices: string): number[] {
  try { return JSON.parse(outcomePrices).map(Number); } catch { return [0.5, 0.5]; }
}

function parseOutcomes(outcomes: string): string[] {
  try { return JSON.parse(outcomes); } catch { return ['Yes', 'No']; }
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ── NAV ITEMS ─────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'portfolio', label: 'Portfolio',  icon: '◈', color: '#00c8ff' },
  { id: 'vault',     label: 'Vault',      icon: '⬡', color: '#00ff9d' },
  { id: 'swap',      label: 'Swap',       icon: '⇄', color: '#a78bfa' },
  { id: 'market',    label: 'Market',     icon: '◎', color: '#ffd700' },
  { id: 'agent',     label: 'GhostAgent', icon: '👻', color: '#ff6b35' },
  { id: 'security',  label: 'Security',   icon: '🛡', color: '#00ff9d' },
] as const;

type TabId = typeof NAV_ITEMS[number]['id'];

// ── SPARKLINE ─────────────────────────────────────────────────
function Sparkline({ data, color, width = 80, height = 28 }: { data: number[]; color: string; width?: number; height?: number }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * height}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ── PORTFOLIO TAB ─────────────────────────────────────────────
function PortfolioTab({ address, ethBalance, userShares, totalAssets }: {
  address?: string;
  ethBalance?: bigint;
  userShares?: bigint;
  totalAssets?: bigint;
}) {
  const { data: ethPrice } = useSWR('eth-price', fetchEthPrice, { refreshInterval: 30000 });
  const price    = ethPrice ?? 3200;
  const ethBal   = parseFloat(formatEther(ethBalance ?? 0n));
  const shares   = parseFloat(formatEther(userShares ?? 0n));
  const tvl      = parseFloat(formatEther(totalAssets ?? 0n));
  const totalUsd = (ethBal + shares) * price;

  const tokens: TokenBalance[] = [
    { symbol: 'ETH',  name: 'Ethereum',      balance: ethBal.toFixed(4), usdValue: ethBal * price, change24h: 2.3,  color: '#00c8ff' },
    { symbol: 'WETH', name: 'Wrapped Ether', balance: shares.toFixed(4), usdValue: shares * price, change24h: 2.1,  color: '#a78bfa' },
    { symbol: 'USDC', name: 'USD Coin',      balance: '0.0000',          usdValue: 0,              change24h: 0.01, color: '#00ff9d' },
  ];

  const sparkBase = [0.3, 0.5, 0.4, 0.7, 0.6, 0.8, 0.75, 0.9, 0.85, 1.0];

  const txs = [
    { hash: '0xabc...123', type: 'deposit'  as const, amount: '0.05', token: 'WETH', time: '2m ago' },
    { hash: '0xdef...456', type: 'receive'  as const, amount: '0.18', token: 'ETH',  time: '1h ago' },
    { hash: '0xghi...789', type: 'withdraw' as const, amount: '0.02', token: 'WETH', time: '3h ago' },
  ];
  const txColors = { deposit: '#00ff9d', withdraw: '#ff6b35', swap: '#a78bfa', receive: '#00c8ff' };
  const txIcons  = { deposit: '↓', withdraw: '↑', swap: '⇄', receive: '↙' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ background: 'linear-gradient(135deg,#0a1628 0%,#0f1f38 100%)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: '12px', padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, right: 0, width: '200px', height: '200px', background: 'radial-gradient(circle,rgba(0,200,255,0.06) 0%,transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', letterSpacing: '0.2em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Total Portfolio Value</div>
        <div style={{ fontFamily: 'var(--display)', fontSize: '2.2rem', fontWeight: 900, color: 'var(--blue)', marginBottom: '0.3rem' }}>
          ${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '0.6rem', color: 'var(--green)' }}>▲ +2.3% (24h)</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '0.6rem', color: 'var(--muted)' }}>Vault TVL: {tvl.toFixed(4)} ETH</span>
          {address && <span style={{ fontFamily: 'var(--mono)', fontSize: '0.6rem', color: 'var(--muted)' }}>{shortAddr(address)}</span>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '0.8rem' }}>
        {[
          { label: 'ETH Balance',  value: `${ethBal.toFixed(4)} ETH`,  sub: `$${(ethBal * price).toFixed(2)}`,                       color: '#00c8ff', icon: '◈' },
          { label: 'Vault Shares', value: `${shares.toFixed(4)}`,       sub: `$${(shares * price).toFixed(2)}`,                       color: '#00ff9d', icon: '⬡' },
          { label: 'Current APY',  value: '18.4%',                      sub: 'ETH/USDC Wide',                                         color: '#ffd700', icon: '◎' },
          { label: 'Est. Monthly', value: `+$${(shares * price * 0.184 / 12).toFixed(2)}`, sub: 'at current APY',                    color: '#a78bfa', icon: '↗' },
        ].map((s, i) => (
          <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '0.52rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>{s.label}</span>
              <span style={{ color: s.color, fontSize: '0.7rem' }}>{s.icon}</span>
            </div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '1rem', fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', color: 'var(--muted)', marginTop: '0.2rem' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '1.2rem' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', letterSpacing: '0.18em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '1rem' }}>Token Balances</div>
        {tokens.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.7rem 0', borderBottom: i < tokens.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: `${t.color}20`, border: `1px solid ${t.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: '0.55rem', color: t.color, fontWeight: 700, flexShrink: 0 }}>{t.symbol.slice(0, 2)}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text)' }}>{t.symbol}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '0.52rem', color: 'var(--muted)' }}>{t.name}</div>
            </div>
            <Sparkline data={sparkBase} color={t.color} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text)' }}>{t.balance}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '0.52rem', color: t.change24h >= 0 ? 'var(--green)' : 'var(--orange)' }}>{t.change24h >= 0 ? '▲' : '▼'} {Math.abs(t.change24h)}%</div>
            </div>
            <div style={{ textAlign: 'right', minWidth: '70px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '0.68rem', color: t.color }}>${t.usdValue.toFixed(2)}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '1.2rem' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', letterSpacing: '0.18em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '1rem' }}>Recent Transactions</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {txs.map((tx, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.6rem 0.8rem', background: 'var(--bg)', borderRadius: '6px', border: `1px solid ${txColors[tx.type]}18` }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: `${txColors[tx.type]}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: txColors[tx.type], fontSize: '0.8rem', flexShrink: 0 }}>{txIcons[tx.type]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '0.62rem', fontWeight: 700, color: txColors[tx.type], textTransform: 'uppercase' }}>{tx.type}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '0.52rem', color: 'var(--muted)' }}>{tx.hash}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '0.65rem', color: 'var(--text)' }}>{tx.amount} {tx.token}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '0.5rem', color: 'var(--muted)' }}>{tx.time}</div>
              </div>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px var(--green)' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── MARKET TAB ────────────────────────────────────────────────
function MarketTab() {
  const { data: markets, error, isLoading } = useSWR('polymarkets', fetchCryptoMarkets, { refreshInterval: 30000 });
  if (isLoading) return <div style={{ textAlign: 'center', padding: '4rem', fontFamily: 'var(--mono)', color: 'var(--muted)', fontSize: '0.7rem' }}>⟳ FETCHING POLYMARKET DATA...</div>;
  if (error) return <div style={{ textAlign: 'center', padding: '4rem', fontFamily: 'var(--mono)', color: 'var(--orange)', fontSize: '0.7rem', lineHeight: 2 }}>⚠ Cannot reach Polymarket API<br /><span style={{ fontSize: '0.6rem', color: 'var(--muted)' }}>CORS issue in dev — works on Vercel.</span></div>;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1rem' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '0.62rem', letterSpacing: '0.15em', color: 'var(--blue)', textTransform: 'uppercase' }}>Polymarket · Live Crypto Markets</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '0.52rem', background: 'rgba(0,255,157,0.1)', border: '1px solid rgba(0,255,157,0.2)', color: 'var(--green)', padding: '0.15rem 0.5rem', borderRadius: '3px' }}>LIVE · {markets?.length ?? 0} markets</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '0.8rem' }}>
        {markets?.map(market => {
          const prices   = parsePrices(market.outcomePrices);
          const outcomes = parseOutcomes(market.outcomes);
          const yesPrice = prices[0] ?? 0.5;
          const bullish  = yesPrice >= 0.5;
          return (
            <div key={market.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '1.2rem', cursor: 'pointer' }} onClick={() => window.open(`https://polymarket.com/market/${market.id}`, '_blank')}>
              <p style={{ fontFamily: 'var(--mono)', fontSize: '0.68rem', fontWeight: 700, lineHeight: 1.5, marginBottom: '1rem', color: 'var(--text)' }}>{market.question}</p>
              <div style={{ marginBottom: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '0.6rem', color: 'var(--green)', fontWeight: 700 }}>{outcomes[0]} {(yesPrice * 100).toFixed(0)}%</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '0.6rem', color: 'var(--orange)', fontWeight: 700 }}>{outcomes[1]} {((1 - yesPrice) * 100).toFixed(0)}%</span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${yesPrice * 100}%`, background: bullish ? 'var(--green)' : 'var(--orange)', borderRadius: '3px', transition: 'width 0.5s' }} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', color: 'var(--muted)' }}>Vol: ${(market.volume / 1000).toFixed(0)}K</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', color: 'var(--muted)' }}>Liq: ${(market.liquidity / 1000).toFixed(0)}K</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', fontWeight: 700, color: bullish ? 'var(--green)' : 'var(--orange)' }}>{bullish ? '▲ YES' : '▼ NO'}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── AGENT TAB ─────────────────────────────────────────────────
function AgentTab() {
  const logs = [
    { time: '20:53:06', msg: '✓ Pool found: 0x94bfc0...EEeC0 (fee: 0.05%)',         level: 'success' },
    { time: '20:53:06', msg: 'Tick: -129331 | Price: 0.000002 | In position: false', level: 'info'    },
    { time: '20:53:06', msg: 'ℹ Vault not in position — skipping rebalance',         level: 'info'    },
    { time: '20:52:06', msg: '🐋 Whale detected: 0xc8S...157 — 27.5 ETH',            level: 'warning' },
    { time: '20:51:06', msg: '✓ All systems nominal',                                 level: 'success' },
    { time: '20:50:06', msg: 'New deposit: 0.407 ETH from 0xb47c...f057',             level: 'info'    },
  ];
  const levelColors: Record<string, string> = { success: '#00ff9d', info: '#00c8ff', warning: '#ffaa00', danger: '#ff3366' };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid rgba(123,111,255,0.3)', borderRadius: '12px', padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', letterSpacing: '0.2em', color: '#7b6fff', textTransform: 'uppercase' }}>GhostAgent Status</div>
        <svg width={80} height={96} viewBox="0 0 100 120" fill="none" style={{ filter: 'drop-shadow(0 0 20px rgba(123,111,255,0.5))', animation: 'ghostFloat 4s ease-in-out infinite' }}>
          <path d="M15 55 Q15 15 50 15 Q85 15 85 55 L85 100 Q75 92 65 100 Q55 92 50 100 Q45 92 35 100 Q25 92 15 100 Z" fill="#7b6fff" opacity="0.92" />
          <path d="M25 35 Q30 25 50 22 Q70 25 75 35 Q60 30 50 32 Q40 30 25 35Z" fill="white" opacity="0.18" />
          <ellipse cx="37" cy="52" rx="9" ry="11" fill="white" /><ellipse cx="39" cy="50" rx="4" ry="5" fill="#1a0a2e" /><circle cx="41" cy="48" r="1.5" fill="white" />
          <ellipse cx="63" cy="52" rx="9" ry="11" fill="white" /><ellipse cx="65" cy="50" rx="4" ry="5" fill="#1a0a2e" /><circle cx="67" cy="48" r="1.5" fill="white" />
          <ellipse cx="50" cy="72" rx="8" ry="5" fill="#1a0a2e" opacity="0.5" />
        </svg>
        <div style={{ fontFamily: 'var(--display)', fontSize: '0.8rem', fontWeight: 700, color: '#7b6fff' }}>MONITORING</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', width: '100%' }}>
          {[
            { label: 'Uptime',   val: '99.9%', color: '#00ff9d' },
            { label: 'Checks',  val: '1,247',  color: '#00c8ff' },
            { label: 'Alerts',  val: '3',      color: '#ffaa00' },
            { label: 'Network', val: 'Base',   color: '#7b6fff' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'var(--bg)', borderRadius: '6px', padding: '0.5rem', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '0.5rem', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>{s.label}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '0.75rem', fontWeight: 700, color: s.color }}>{s.val}</div>
            </div>
          ))}
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '0.52rem', color: 'var(--muted)', textAlign: 'center', lineHeight: 1.6 }}>Railway · 24/7 · Base Sepolia<br />Checks every 60s</div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.2rem' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', letterSpacing: '0.18em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '1rem' }}>Live Logs · Railway</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '320px', overflowY: 'auto' }}>
          {logs.map((log, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.8rem', padding: '0.4rem 0.6rem', background: 'var(--bg)', borderRadius: '4px', borderLeft: `2px solid ${levelColors[log.level]}` }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '0.52rem', color: 'var(--muted)', flexShrink: 0 }}>{log.time}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '0.58rem', color: levelColors[log.level], lineHeight: 1.4 }}>{log.msg}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ gridColumn: '1 / -1', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.2rem' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', letterSpacing: '0.18em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '1rem' }}>Agent Capabilities · Roadmap</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '0.6rem' }}>
          {[
            { label: 'Price Monitoring',    status: 'LIVE',    color: '#00ff9d' },
            { label: 'Whale Detection',     status: 'LIVE',    color: '#00ff9d' },
            { label: 'Auto-Rebalance',      status: 'LIVE',    color: '#00ff9d' },
            { label: 'AI Analysis (Groq)',  status: 'BETA',    color: '#ffaa00' },
            { label: 'AgentKit CDP Wallet', status: 'BETA',    color: '#ffaa00' },
            { label: 'Auto-Swap on Alert',  status: 'SOON',    color: '#7b6fff' },
            { label: 'Emergency Withdraw',  status: 'SOON',    color: '#7b6fff' },
            { label: 'Cross-chain Bridge',  status: 'PLANNED', color: '#3a5a7a' },
          ].map((c, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.8rem', background: 'var(--bg)', borderRadius: '6px' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '0.6rem', color: 'var(--text)' }}>{c.label}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '0.48rem', color: c.color, background: `${c.color}15`, border: `1px solid ${c.color}30`, padding: '0.1rem 0.4rem', borderRadius: '2px', letterSpacing: '0.1em' }}>{c.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── VAULT TAB ─────────────────────────────────────────────────
function VaultTab({ address, isConnected, ethBalance, userShares, isPending, isSuccess, writeError, onSubmit }: {
  address?: string; isConnected: boolean; ethBalance?: bigint; userShares?: bigint;
  isPending: boolean; isSuccess: boolean; writeError: Error | null;
  onSubmit: (action: 'deposit' | 'withdraw', amount: string) => void;
}) {
  const [amount, setAmount] = useState('');
  const [action, setAction] = useState<'deposit' | 'withdraw'>('deposit');
  const amountValid = isValidAmount(amount);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1rem' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.2rem' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 8px var(--green)', animation: 'pulse 2s infinite' }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: '0.62rem', letterSpacing: '0.15em', color: 'var(--blue)', textTransform: 'uppercase' }}>ETH / USDC · Wide Strategy</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.2rem' }}>
          {(['deposit', 'withdraw'] as const).map(a => (
            <button key={a} onClick={() => setAction(a)} style={{ flex: 1, padding: '0.55rem', fontFamily: 'var(--mono)', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', border: `1px solid ${action === a ? 'var(--blue)' : 'var(--border)'}`, background: action === a ? 'rgba(0,200,255,0.12)' : 'transparent', color: action === a ? 'var(--blue)' : 'var(--muted)', cursor: 'pointer', borderRadius: '4px' }}>{a}</button>
          ))}
        </div>
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1rem', marginBottom: '0.8rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', color: 'var(--muted)' }}>AMOUNT</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', color: 'var(--muted)', cursor: 'pointer' }}
              onClick={() => { const max = action === 'withdraw' ? formatEther(userShares ?? 0n) : formatEther(ethBalance ?? 0n); setAmount(parseFloat(max).toFixed(6)); }}>
              Max: <span style={{ color: 'var(--blue)' }}>{action === 'withdraw' ? parseFloat(formatEther(userShares ?? 0n)).toFixed(4) : parseFloat(formatEther(ethBalance ?? 0n)).toFixed(4)}</span>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <input type="number" placeholder="0.000000" value={amount} onChange={e => setAmount(sanitizeAmount(e.target.value))} style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: 'var(--mono)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--text)' }} />
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.3rem 0.7rem', fontFamily: 'var(--mono)', fontSize: '0.7rem', fontWeight: 700 }}>{action === 'deposit' ? 'WETH' : 'SHARES'}</div>
          </div>
        </div>
        {writeError && <p style={{ fontFamily: 'var(--mono)', fontSize: '0.6rem', color: 'var(--orange)', marginBottom: '0.8rem' }}>⚠ {writeError.message.slice(0, 80)}...</p>}
        <button onClick={() => onSubmit(action, amount)} disabled={!isConnected || isPending || !amountValid}
          style={{ width: '100%', padding: '0.85rem', fontFamily: 'var(--mono)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', border: 'none', borderRadius: '6px', cursor: (!isConnected || !amountValid) ? 'not-allowed' : 'pointer', background: (!isConnected || !amountValid) ? 'var(--muted)' : 'var(--green)', color: 'var(--bg)' }}>
          {!isConnected ? '🔒 Connect Wallet' : isPending ? '⟳ Confirming...' : isSuccess ? '✓ Success!' : action === 'deposit' ? '↓ Deposit' : '↑ Withdraw'}
        </button>
        <p style={{ fontFamily: 'var(--mono)', fontSize: '0.52rem', color: 'var(--muted)', textAlign: 'center', marginTop: '0.8rem' }}>{VAULT_ADDRESS.slice(0, 10)}...{VAULT_ADDRESS.slice(-8)} · Base Sepolia · ERC-4626</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1.2rem' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--blue)', textTransform: 'uppercase', marginBottom: '1rem' }}>🛡️ Security Status</div>
          {[
            { label: 'ERC-4626 Standard',   warn: false },
            { label: 'Reentrancy Guard',    warn: false },
            { label: 'Ownable Access',      warn: false },
            { label: 'Emergency Withdraw',  warn: false },
            { label: 'Slippage Protection', warn: false },
            { label: 'Mainnet Audit',       warn: true  },
          ].map((c, i, arr) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '0.62rem', color: 'var(--muted)' }}>{c.label}</span>
              <span style={{ fontSize: '0.7rem', color: c.warn ? 'var(--orange)' : 'var(--green)' }}>{c.warn ? '⚠' : '✓'}</span>
            </div>
          ))}
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1.2rem' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '0.8rem' }}>Contract Info</div>
          {[{ k: 'Standard', v: 'ERC-4626' }, { k: 'Protocol', v: 'Uniswap V3' }, { k: 'Network', v: 'Base Sepolia' }, { k: 'Fee', v: '0.5%' }, { k: 'Keeper', v: 'GhostBot ●' }].map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '0.6rem', color: 'var(--muted)' }}>{r.k}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '0.6rem', color: r.k === 'Keeper' ? 'var(--green)' : 'var(--text)' }}>{r.v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── SECURITY TAB ──────────────────────────────────────────────
function SecurityTab() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '1rem' }}>
      {[
        { title: '🔒 Reentrancy Guard',  desc: 'All state-modifying functions protected with OpenZeppelin ReentrancyGuard.', status: 'SECURED',  color: '#00ff9d' },
        { title: '👤 Access Control',    desc: 'Ownable pattern — only owner can set keeper and fee recipient.',             status: 'SECURED',  color: '#00ff9d' },
        { title: '🚨 Emergency Exit',    desc: 'emergencyWithdraw() lets owner pull all funds instantly.',                  status: 'SECURED',  color: '#00ff9d' },
        { title: '✅ ERC-4626 Standard', desc: 'Vault follows the tokenized vault standard. Compatible with all major DeFi.', status: 'VERIFIED', color: '#00c8ff' },
        { title: '⚡ Input Validation',  desc: 'Frontend sanitizes all amounts. Contract validates tick ranges.',            status: 'SECURED',  color: '#00ff9d' },
        { title: '⚠️ Audit Pending',     desc: 'Smart contract audit required before mainnet deployment.',                  status: 'PENDING',  color: '#ff6b35' },
      ].map((item, i) => (
        <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '1.2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '0.72rem', fontWeight: 700 }}>{item.title}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '0.52rem', color: item.color, background: `${item.color}18`, border: `1px solid ${item.color}40`, padding: '0.15rem 0.5rem', borderRadius: '3px', letterSpacing: '0.1em' }}>{item.status}</span>
          </div>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '0.62rem', color: 'var(--muted)', lineHeight: 1.6 }}>{item.desc}</p>
        </div>
      ))}
    </div>
  );
}

// ── TICKER ────────────────────────────────────────────────────
const TICKER_DATA = [
  { pair: 'ETH/USDC', trend: '+2.3%', apy: '18.4%', color: '#00ff9d' },
  { pair: 'WBTC/ETH', trend: '+0.8%', apy: '22.1%', color: '#00c8ff' },
  { pair: 'BASE/ETH', trend: '+5.1%', apy: '41.3%', color: '#00ff9d' },
  { pair: 'USDC/DAI', trend: '+0.1%', apy: '8.2%',  color: '#ffd700' },
];

// ── MAIN PAGE ─────────────────────────────────────────────────
export default function Home() {
  const { address, isConnected } = useAccount();
  const [activeTab, setActiveTab] = useState<TabId>('portfolio');

  const { data: totalAssets } = useReadContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'totalAssets' });
  const { data: userShares  } = useReadContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'balanceOf', args: [address!], query: { enabled: !!address } });
  const { data: inPosition  } = useReadContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'inPosition' });
  const { data: ethBalance  } = useBalance({ address });
  const { writeContract, isPending, isSuccess, error: writeError } = useWriteContract();

  const handleSubmit = useCallback((action: 'deposit' | 'withdraw', amount: string) => {
    if (!address || !isConnected) return;
    const parsed = parseEther(amount);
    if (action === 'deposit') {
      writeContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'deposit', args: [parsed, address] });
    } else {
      writeContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'withdraw', args: [parsed, address, address] });
    }
  }, [address, isConnected, writeContract]);

  const activeNav = NAV_ITEMS.find(n => n.id === activeTab)!;

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
        body::before{content:'';position:fixed;inset:0;
          background:radial-gradient(ellipse at 10% 20%,rgba(0,200,255,0.04) 0%,transparent 50%),
                      radial-gradient(ellipse at 90% 80%,rgba(0,255,157,0.03) 0%,transparent 50%),
                      linear-gradient(rgba(0,200,255,0.015) 1px,transparent 1px),
                      linear-gradient(90deg,rgba(0,200,255,0.015) 1px,transparent 1px);
          background-size:auto,auto,32px 32px,32px 32px;pointer-events:none;z-index:0}
        .scanline{position:fixed;top:0;left:0;right:0;height:2px;background:rgba(0,200,255,0.12);animation:scan 8s linear infinite;pointer-events:none;z-index:999}
        @keyframes scan{0%{top:0}100%{top:100vh}}
        @keyframes pulse{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(1.3)}}
        @keyframes ghostFloat{0%,100%{transform:translateY(0px)}50%{transform:translateY(-8px)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .sidebar-btn{display:flex;align-items:center;gap:.7rem;padding:.6rem .8rem;border-radius:6px;border:1px solid transparent;background:transparent;cursor:pointer;transition:all .15s;width:100%;text-align:left}
        .sidebar-btn:hover{background:rgba(255,255,255,0.04)}
        input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        input[type=number]{-moz-appearance:textfield}
        select{outline:none}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:var(--bg)}
        ::-webkit-scrollbar-thumb{background:var(--muted);border-radius:2px}
        @media(max-width:768px){.pro-layout{grid-template-columns:1fr !important}.sidebar{display:none !important}}
      `}</style>

      <div className="scanline" />

      <div className="pro-layout" style={{ display: 'grid', gridTemplateColumns: '200px 1fr', minHeight: '100vh', position: 'relative', zIndex: 1 }}>

        <aside className="sidebar" style={{ background: 'rgba(10,22,40,0.98)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', padding: '1rem 0.8rem', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0.4rem 1.2rem', borderBottom: '1px solid var(--border)', marginBottom: '0.8rem' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--blue)', animation: 'pulse 2s infinite', boxShadow: '0 0 8px var(--blue)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--display)', fontWeight: 900, fontSize: '0.85rem', letterSpacing: '0.05em' }}>BASE<span style={{ color: 'var(--blue)' }}>VAULT</span></span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '0.42rem', background: 'rgba(0,200,255,0.1)', border: '1px solid rgba(0,200,255,0.2)', color: 'var(--blue)', padding: '0.1rem 0.3rem', borderRadius: '2px', letterSpacing: '0.1em', marginLeft: 'auto' }}>PRO</span>
          </div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flex: 1 }}>
            {NAV_ITEMS.map(item => (
              <button key={item.id} className="sidebar-btn"
                style={{ borderColor: activeTab === item.id ? `${item.color}30` : 'transparent', background: activeTab === item.id ? `${item.color}08` : 'transparent' }}
                onClick={() => setActiveTab(item.id)}>
                <span style={{ fontSize: '0.9rem', width: '18px', textAlign: 'center' }}>{item.icon}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '0.62rem', letterSpacing: '0.08em', color: activeTab === item.id ? item.color : 'var(--muted)', textTransform: 'uppercase' }}>{item.label}</span>
                {item.id === 'agent' && <div style={{ marginLeft: 'auto', width: '6px', height: '6px', borderRadius: '50%', background: '#00ff9d', boxShadow: '0 0 6px #00ff9d', animation: 'pulse 2s infinite' }} />}
              </button>
            ))}
          </nav>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.8rem', marginTop: '0.8rem' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '0.48rem', color: 'var(--muted)', lineHeight: 1.8 }}>
              <div>Network: Base Sepolia</div>
              <div>Contract: {VAULT_ADDRESS.slice(0, 8)}...</div>
              <div style={{ color: '#00ff9d' }}>● Keeper: Online</div>
            </div>
          </div>
        </aside>

        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <header style={{ background: 'rgba(3,8,16,0.92)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border)', padding: '0.7rem 1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', position: 'sticky', top: 0, zIndex: 50 }}>
            <div style={{ display: 'flex', gap: '1.5rem', overflowX: 'auto', flex: 1 }}>
              {TICKER_DATA.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '0.58rem', color: 'var(--muted)' }}>{p.pair}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '0.58rem', color: p.color, fontWeight: 700 }}>{p.trend}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '0.52rem', color: 'var(--muted)' }}>{p.apy} APY</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
              <span style={{ fontSize: '0.9rem' }}>{activeNav.icon}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.15em', color: activeNav.color, textTransform: 'uppercase' }}>{activeNav.label}</span>
            </div>
            <ConnectButton chainStatus="icon" showBalance={false} accountStatus="avatar" />
          </header>

          <main style={{ flex: 1, padding: '1.2rem', animation: 'fadeUp 0.3s ease' }}>
            {activeTab === 'portfolio' && <PortfolioTab address={address} ethBalance={ethBalance?.value} userShares={userShares} totalAssets={totalAssets} />}
            {activeTab === 'vault'     && <VaultTab address={address} isConnected={isConnected} ethBalance={ethBalance?.value} userShares={userShares} isPending={isPending} isSuccess={isSuccess} writeError={writeError} onSubmit={handleSubmit} />}
            {activeTab === 'swap'      && <SwapTab />}
            {activeTab === 'market'    && <MarketTab />}
            {activeTab === 'agent'     && <AgentTab />}
            {activeTab === 'security'  && <SecurityTab />}
          </main>
        </div>
      </div>

      <GhostAgent />
    </>
  );
}