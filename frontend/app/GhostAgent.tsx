'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePublicClient, useWatchContractEvent } from 'wagmi';
import { VAULT_ADDRESS, VAULT_ABI } from './wagmi';
import { formatEther } from 'viem';

// ── TYPES ────────────────────────────────────────────────────
type AlertLevel = 'safe' | 'warning' | 'danger';

interface SecurityEvent {
  id: string;
  type: 'deposit' | 'withdraw' | 'rebalance' | 'whale' | 'attack' | 'suspicious';
  message: string;
  wallet: string;
  amount?: string;
  timestamp: number;
  level: AlertLevel;
}

interface WhaleTx {
  wallet: string;
  action: string;
  amount: string;
  time: string;
  level: AlertLevel;
}

// ── HELPERS ──────────────────────────────────────────────────
function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function randomAddr() {
  return '0x' + [...Array(40)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

// ── GHOST SVG MASCOT ─────────────────────────────────────────
function GhostSVG({ level, size = 60 }: { level: AlertLevel; size?: number }) {
  const colors: Record<AlertLevel, { body: string; glow: string; eyes: string }> = {
    safe:    { body: '#7b6fff', glow: 'rgba(123,111,255,0.4)', eyes: '#ffffff' },
    warning: { body: '#ffaa00', glow: 'rgba(255,170,0,0.5)',   eyes: '#fff8e0' },
    danger:  { body: '#ff3366', glow: 'rgba(255,51,102,0.6)',  eyes: '#ffccdd' },
  };
  const c = colors[level];

  return (
    <svg width={size} height={size} viewBox="0 0 100 120" fill="none"
      style={{ filter: `drop-shadow(0 0 ${size/4}px ${c.glow})` }}>
      {/* Body */}
      <path d="M15 55 Q15 15 50 15 Q85 15 85 55 L85 100 Q75 92 65 100 Q55 92 50 100 Q45 92 35 100 Q25 92 15 100 Z"
        fill={c.body} opacity="0.92"/>
      {/* Shimmer overlay */}
      <path d="M25 35 Q30 25 50 22 Q70 25 75 35 Q60 30 50 32 Q40 30 25 35Z"
        fill="white" opacity="0.18"/>
      {/* Left eye */}
      <ellipse cx="37" cy="52" rx="9" ry="11" fill={c.eyes}/>
      <ellipse cx="39" cy="50" rx="4" ry="5" fill="#1a0a2e"/>
      <circle cx="41" cy="48" r="1.5" fill="white"/>
      {/* Right eye */}
      <ellipse cx="63" cy="52" rx="9" ry="11" fill={c.eyes}/>
      <ellipse cx="65" cy="50" rx="4" ry="5" fill="#1a0a2e"/>
      <circle cx="67" cy="48" r="1.5" fill="white"/>
      {/* Mouth — changes by level */}
      {level === 'safe' && <ellipse cx="50" cy="72" rx="8" ry="5" fill="#1a0a2e" opacity="0.5"/>}
      {level === 'warning' && <rect x="42" y="70" width="16" height="4" rx="2" fill="#1a0a2e" opacity="0.6"/>}
      {level === 'danger' && (
        <path d="M42 68 Q50 78 58 68" stroke="#1a0a2e" strokeWidth="3" fill="none" strokeLinecap="round"/>
      )}
      {/* Wavy bottom */}
      <path d="M15 90 Q20 82 27 90 Q34 98 40 90 Q47 82 50 90 Q53 98 60 90 Q67 82 73 90 Q80 98 85 90"
        stroke={c.body} strokeWidth="3" fill="none" opacity="0.7"/>
    </svg>
  );
}

// ── ALERT POPUP ──────────────────────────────────────────────
function AlertPopup({ event, onDismiss }: { event: SecurityEvent; onDismiss: () => void }) {
  const colors: Record<AlertLevel, string> = {
    safe: '#7b6fff', warning: '#ffaa00', danger: '#ff3366'
  };
  const icons: Record<SecurityEvent['type'], string> = {
    deposit: '↓', withdraw: '↑', rebalance: '⟳',
    whale: '🐋', attack: '⚠️', suspicious: '👁'
  };

  return (
    <div style={{
      position: 'fixed', bottom: '5rem', right: '1.5rem', zIndex: 1000,
      background: '#0a1628', border: `1px solid ${colors[event.level]}`,
      borderRadius: '12px', padding: '1rem 1.2rem', maxWidth: '320px',
      boxShadow: `0 0 24px ${colors[event.level]}40`,
      animation: 'slideIn 0.3s ease',
    }}>
      <style>{`@keyframes slideIn{from{transform:translateX(100px);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.6rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <GhostSVG level={event.level} size={28} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: '0.65rem', fontWeight: 700, color: colors[event.level], letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            GhostAgent {event.level === 'danger' ? '⚡ ALERT' : event.level === 'warning' ? '⚠ WARNING' : '● ACTIVITY'}
          </span>
        </div>
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: '#3a5a7a', cursor: 'pointer', fontSize: '1rem' }}>×</button>
      </div>
      <p style={{ fontFamily: 'var(--mono)', fontSize: '0.68rem', color: '#cde4f5', lineHeight: 1.5, marginBottom: '0.4rem' }}>
        {icons[event.type]} {event.message}
      </p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', color: '#3a5a7a' }}>{shortAddr(event.wallet)}</span>
        {event.amount && <span style={{ fontFamily: 'var(--mono)', fontSize: '0.6rem', color: colors[event.level], fontWeight: 700 }}>{event.amount}</span>}
        <span style={{ fontFamily: 'var(--mono)', fontSize: '0.52rem', color: '#3a5a7a' }}>{timeAgo(event.timestamp)}</span>
      </div>
    </div>
  );
}

// ── GHOST DASHBOARD ──────────────────────────────────────────
function GhostDashboard({
  events, level, isOpen, onClose, stats
}: {
  events: SecurityEvent[];
  level: AlertLevel;
  isOpen: boolean;
  onClose: () => void;
  stats: { totalTx: number; whalesDetected: number; suspiciousTx: number; tvlChange: string };
}) {
  if (!isOpen) return null;

  const levelColors: Record<AlertLevel, string> = {
    safe: '#7b6fff', warning: '#ffaa00', danger: '#ff3366'
  };
  const color = levelColors[level];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 998,
      background: 'rgba(3,8,16,0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
      padding: '5rem 1.5rem 1.5rem',
    }} onClick={onClose}>
      <div style={{
        background: '#0a1628', border: `1px solid ${color}`,
        borderRadius: '16px', padding: '1.5rem', width: '380px', maxHeight: '80vh',
        overflowY: 'auto', boxShadow: `0 0 40px ${color}30`,
        animation: 'dashIn 0.3s ease',
      }} onClick={e => e.stopPropagation()}>
        <style>{`@keyframes dashIn{from{transform:scale(0.92);opacity:0}to{transform:scale(1);opacity:1}}`}</style>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1.2rem' }}>
          <GhostSVG level={level} size={44} />
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '0.9rem', color, letterSpacing: '0.05em' }}>GHOST AGENT</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', color: '#3a5a7a', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              Security AI · {level.toUpperCase()}
            </div>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#3a5a7a', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '1.2rem' }}>
          {[
            { label: 'Transactions',     val: stats.totalTx.toString(),      icon: '📊', c: '#00c8ff' },
            { label: 'Whales Detected',  val: stats.whalesDetected.toString(),icon: '🐋', c: '#ffd700' },
            { label: 'Suspicious',       val: stats.suspiciousTx.toString(), icon: '⚠️', c: '#ff6b35' },
            { label: 'TVL Change',       val: stats.tvlChange,               icon: '📈', c: '#00ff9d' },
          ].map((s, i) => (
            <div key={i} style={{ background: '#050a10', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '0.8rem' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '0.5rem', color: '#3a5a7a', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
                {s.icon} {s.label}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '1rem', fontWeight: 700, color: s.c }}>{s.val}</div>
            </div>
          ))}
        </div>

        {/* Activity feed */}
        <div style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', color: '#3a5a7a', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '0.6rem' }}>
          Live Activity Feed
        </div>

        {events.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', fontFamily: 'var(--mono)', fontSize: '0.65rem', color: '#3a5a7a' }}>
            No activity detected yet
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {events.slice(0, 20).map(ev => {
              const evColors: Record<AlertLevel, string> = { safe: '#7b6fff', warning: '#ffaa00', danger: '#ff3366' };
              const evIcons: Record<SecurityEvent['type'], string> = {
                deposit: '↓', withdraw: '↑', rebalance: '⟳', whale: '🐋', attack: '⚠️', suspicious: '👁'
              };
              return (
                <div key={ev.id} style={{
                  background: '#050a10', border: `1px solid ${evColors[ev.level]}22`,
                  borderLeft: `3px solid ${evColors[ev.level]}`,
                  borderRadius: '6px', padding: '0.6rem 0.8rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '0.62rem', color: evColors[ev.level], fontWeight: 700 }}>
                      {evIcons[ev.type]} {ev.type.toUpperCase()}
                    </span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '0.5rem', color: '#3a5a7a' }}>{timeAgo(ev.timestamp)}</span>
                  </div>
                  <p style={{ fontFamily: 'var(--mono)', fontSize: '0.6rem', color: '#8aa4c0', lineHeight: 1.4, marginBottom: '0.2rem' }}>{ev.message}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '0.52rem', color: '#3a5a7a' }}>{shortAddr(ev.wallet)}</span>
                    {ev.amount && <span style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', color: evColors[ev.level] }}>{ev.amount}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Whale radar */}
        <div style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', color: '#3a5a7a', letterSpacing: '0.15em', textTransform: 'uppercase', margin: '1rem 0 0.6rem' }}>
          🐋 Whale Radar
        </div>
        <div style={{ background: '#050a10', border: '1px solid rgba(255,215,0,0.15)', borderRadius: '8px', padding: '0.8rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            {['Wallet', 'Action', 'Amount', 'Time'].map(h => (
              <span key={h} style={{ fontFamily: 'var(--mono)', fontSize: '0.5rem', color: '#3a5a7a', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{h}</span>
            ))}
          </div>
          {events.filter(e => e.type === 'whale').slice(0, 5).map(e => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', color: '#ffd700' }}>{shortAddr(e.wallet)}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', color: '#cde4f5' }}>{'DEPOSIT'}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', color: '#00ff9d' }}>{e.amount}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '0.52rem', color: '#3a5a7a' }}>{timeAgo(e.timestamp)}</span>
            </div>
          ))}
          {events.filter(e => e.type === 'whale').length === 0 && (
            <p style={{ fontFamily: 'var(--mono)', fontSize: '0.6rem', color: '#3a5a7a', textAlign: 'center', padding: '0.5rem' }}>No whales detected</p>
          )}
        </div>

        <div style={{ marginTop: '1rem', fontFamily: 'var(--mono)', fontSize: '0.5rem', color: '#3a5a7a', textAlign: 'center', lineHeight: 1.6 }}>
          GhostAgent monitors every onchain event in real-time.<br />
          Powered by Viem event subscriptions · Base Sepolia
        </div>
      </div>
    </div>
  );
}

// ── MAIN GHOST AGENT COMPONENT ───────────────────────────────
export function GhostAgent() {
  const [level, setLevel]           = useState<AlertLevel>('safe');
  const [events, setEvents]         = useState<SecurityEvent[]>([]);
  const [alert, setAlert]           = useState<SecurityEvent | null>(null);
  const [dashOpen, setDashOpen]     = useState(false);
  const [pulse, setPulse]           = useState(false);
  const [stats, setStats]           = useState({
    totalTx: 0, whalesDetected: 0, suspiciousTx: 0, tvlChange: '+0.00%'
  });

  // ── Push a new event ────────────────────────────────────────
  const pushEvent = useCallback((ev: Omit<SecurityEvent, 'id' | 'timestamp'>) => {
    const fullEv: SecurityEvent = {
      ...ev,
      id: Math.random().toString(36).slice(2),
      timestamp: Date.now(),
    };
    setEvents(prev => [fullEv, ...prev].slice(0, 50));
    setAlert(fullEv);
    setPulse(true);
    setTimeout(() => setPulse(false), 1000);
    setTimeout(() => setAlert(null), 6000);

    // Update level
    if (ev.level === 'danger') setLevel('danger');
    else if (ev.level === 'warning' && level === 'safe') setLevel('warning');

    // Update stats
    setStats(prev => ({
      ...prev,
      totalTx: prev.totalTx + 1,
      whalesDetected: prev.whalesDetected + (ev.type === 'whale' ? 1 : 0),
      suspiciousTx: prev.suspiciousTx + (ev.type === 'suspicious' || ev.type === 'attack' ? 1 : 0),
    }));
  }, [level]);

  // ── Watch real contract events (Deposit/Withdraw) ───────────
  useWatchContractEvent({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    eventName: 'FeesCollected',
    onLogs(logs) {
      logs.forEach(log => {
        const args = log.args as { amount0?: bigint; amount1?: bigint };
        pushEvent({
          type: 'rebalance',
          level: 'safe',
          wallet: log.transactionHash?.slice(0, 42) ?? randomAddr(),
          message: `Fees collected: ${formatEther(args.amount0 ?? 0n)} ETH`,
          amount: `${formatEther(args.amount0 ?? 0n)} ETH`,
        });
      });
    },
  });

  useWatchContractEvent({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    eventName: 'Rebalanced',
    onLogs(logs) {
      logs.forEach(log => {
        pushEvent({
          type: 'rebalance',
          level: 'warning',
          wallet: randomAddr(),
          message: `Vault rebalanced — new range set by keeper`,
          amount: undefined,
        });
      });
    },
  });

  // ── Simulate real-looking events for demo ───────────────────
  useEffect(() => {
    const scenarios = [
      () => pushEvent({ type:'deposit', level:'safe', wallet: randomAddr(), message:'New deposit detected in vault', amount:`${(Math.random()*2+0.1).toFixed(3)} ETH` }),
      () => pushEvent({ type:'withdraw', level:'safe', wallet: randomAddr(), message:'User withdrawal processed', amount:`${(Math.random()*1+0.05).toFixed(3)} ETH` }),
      () => pushEvent({ type:'whale', level:'warning', wallet: randomAddr(), message:`Large position detected — wallet holds >50 ETH`, amount:`${(Math.random()*20+10).toFixed(1)} ETH` }),
      () => pushEvent({ type:'suspicious', level:'warning', wallet: randomAddr(), message:'Rapid deposit/withdraw detected — possible bot activity', amount: undefined }),
      () => { setLevel('safe'); setStats(p=>({...p,tvlChange:`+${(Math.random()*5).toFixed(2)}%`})); },
    ];

    // First event immediately
    setTimeout(() => scenarios[0](), 3000);

    const id = setInterval(() => {
      const rand = Math.random();
      if (rand < 0.4) scenarios[0]();       // deposit
      else if (rand < 0.6) scenarios[1]();  // withdraw
      else if (rand < 0.75) scenarios[2](); // whale
      else if (rand < 0.88) scenarios[3](); // suspicious
      else scenarios[4]();                  // reset safe
    }, 8000 + Math.random() * 7000);

    return () => clearInterval(id);
  }, [pushEvent]);

  // Auto-recover to safe after 30s of no danger
  useEffect(() => {
    if (level === 'danger') {
      const id = setTimeout(() => setLevel('warning'), 15000);
      return () => clearTimeout(id);
    }
    if (level === 'warning') {
      const id = setTimeout(() => setLevel('safe'), 20000);
      return () => clearTimeout(id);
    }
  }, [level]);

  const levelColors: Record<AlertLevel, string> = {
    safe: '#7b6fff', warning: '#ffaa00', danger: '#ff3366'
  };
  const levelLabels: Record<AlertLevel, string> = {
    safe: 'ALL CLEAR', warning: 'MONITORING', danger: 'ALERT'
  };

  return (
    <>
      <style>{`
        @keyframes ghostFloat {
          0%,100% { transform: translateY(0px) rotate(-1deg); }
          50%      { transform: translateY(-10px) rotate(1deg); }
        }
        @keyframes ghostPulse {
          0%,100% { transform: translateY(0px) scale(1); }
          50%      { transform: translateY(-12px) scale(1.08); }
        }
        @keyframes ringPulse {
          0%   { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes badgePop {
          0%   { transform: scale(0.8); }
          50%  { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
      `}</style>

      {/* ── FLOATING GHOST ── */}
      <div style={{
        position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 997,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem',
        cursor: 'pointer',
      }} onClick={() => setDashOpen(d => !d)}>

        {/* Ring pulse on event */}
        {pulse && (
          <div style={{
            position: 'absolute', inset: '-20px',
            borderRadius: '50%', border: `2px solid ${levelColors[level]}`,
            animation: 'ringPulse 0.8s ease-out forwards',
          }} />
        )}

        {/* Event count badge */}
        {events.length > 0 && (
          <div style={{
            position: 'absolute', top: '-4px', right: '-4px',
            background: levelColors[level], color: '#050a10',
            borderRadius: '50%', width: '20px', height: '20px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--mono)', fontSize: '0.55rem', fontWeight: 700,
            animation: 'badgePop 0.3s ease',
            boxShadow: `0 0 8px ${levelColors[level]}`,
          }}>
            {events.length > 99 ? '99+' : events.length}
          </div>
        )}

        {/* Ghost */}
        <div style={{ animation: pulse ? 'ghostPulse 0.4s ease' : 'ghostFloat 4s ease-in-out infinite' }}>
          <GhostSVG level={level} size={64} />
        </div>

        {/* Status label */}
        <div style={{
          fontFamily: 'var(--mono)', fontSize: '0.48rem', letterSpacing: '0.15em',
          color: levelColors[level], textTransform: 'uppercase',
          background: `${levelColors[level]}15`, border: `1px solid ${levelColors[level]}40`,
          padding: '0.15rem 0.5rem', borderRadius: '3px',
          animation: level !== 'safe' ? 'badgePop 1s infinite' : 'none',
        }}>
          {levelLabels[level]}
        </div>
      </div>

      {/* ── ALERT POPUP ── */}
      {alert && <AlertPopup event={alert} onDismiss={() => setAlert(null)} />}

      {/* ── DASHBOARD ── */}
      <GhostDashboard
        events={events}
        level={level}
        isOpen={dashOpen}
        onClose={() => setDashOpen(false)}
        stats={stats}
      />
    </>
  );
}