'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract, useWriteContract } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { useState } from 'react';
import { VAULT_ADDRESS, VAULT_ABI } from './wagmi';

export default function Home() {
  const { address, isConnected } = useAccount();
  const [amount, setAmount] = useState('');
  const [action, setAction] = useState<'deposit' | 'withdraw'>('deposit');

  // Lire totalAssets du vault
  const { data: totalAssets } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'totalAssets',
  });

  // Lire les shares de l'user
  const { data: userShares } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'balanceOf',
    args: [address!],
    query: { enabled: !!address },
  });

  // Lire inPosition
  const { data: inPosition } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'inPosition',
  });

  // Ecrire deposit/withdraw
  const { writeContract, isPending, isSuccess } = useWriteContract();

  function handleSubmit() {
    if (!amount || !address) return;
    const parsed = parseEther(amount);

    if (action === 'deposit') {
      writeContract({
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: 'deposit',
        args: [parsed, address],
      });
    } else {
      writeContract({
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: 'withdraw',
        args: [parsed, address, address],
      });
    }
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: '#050a0f',
      color: '#e0eaf5',
      fontFamily: 'monospace',
      padding: '2rem'
    }}>
      {/* NAV */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>⬡ BaseVault</h1>
        <ConnectButton />
      </div>

      {/* STATS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ background: '#0c1420', border: '1px solid rgba(0,200,255,0.1)', borderRadius: '8px', padding: '1.5rem' }}>
          <p style={{ fontSize: '0.6rem', letterSpacing: '0.2em', color: '#4a6a8a', marginBottom: '0.5rem' }}>TOTAL VALUE LOCKED</p>
          <p style={{ fontSize: '1.2rem', fontWeight: 700, color: '#00c8ff' }}>
            {totalAssets ? formatEther(totalAssets) : '0'} ETH
          </p>
        </div>
        <div style={{ background: '#0c1420', border: '1px solid rgba(0,200,255,0.1)', borderRadius: '8px', padding: '1.5rem' }}>
          <p style={{ fontSize: '0.6rem', letterSpacing: '0.2em', color: '#4a6a8a', marginBottom: '0.5rem' }}>YOUR SHARES</p>
          <p style={{ fontSize: '1.2rem', fontWeight: 700, color: '#00ff9d' }}>
            {userShares ? formatEther(userShares) : '0'}
          </p>
        </div>
        <div style={{ background: '#0c1420', border: '1px solid rgba(0,200,255,0.1)', borderRadius: '8px', padding: '1.5rem' }}>
          <p style={{ fontSize: '0.6rem', letterSpacing: '0.2em', color: '#4a6a8a', marginBottom: '0.5rem' }}>POSITION STATUS</p>
          <p style={{ fontSize: '1.2rem', fontWeight: 700, color: inPosition ? '#00ff9d' : '#ff6b35' }}>
            {inPosition ? 'ACTIVE' : 'IDLE'}
          </p>
        </div>
      </div>

      {/* DEPOSIT/WITHDRAW PANEL */}
      <div style={{ maxWidth: '480px', margin: '0 auto', background: '#0c1420', border: '1px solid rgba(0,200,255,0.15)', borderRadius: '8px', padding: '2rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
          {(['deposit', 'withdraw'] as const).map(a => (
            <button key={a} onClick={() => setAction(a)} style={{
              flex: 1, padding: '0.6rem',
              background: action === a ? '#00c8ff' : 'transparent',
              color: action === a ? '#050a0f' : '#4a6a8a',
              border: '1px solid rgba(0,200,255,0.2)',
              borderRadius: '4px', cursor: 'pointer',
              fontFamily: 'monospace', fontWeight: 700,
              textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.1em'
            }}>
              {a}
            </button>
          ))}
        </div>

        <input
          type="number"
          placeholder="0.00 ETH"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          style={{
            width: '100%', padding: '1rem',
            background: '#050a0f', border: '1px solid rgba(0,200,255,0.2)',
            borderRadius: '4px', color: '#e0eaf5',
            fontFamily: 'monospace', fontSize: '1.2rem',
            marginBottom: '1rem', outline: 'none'
          }}
        />

        <button
          onClick={handleSubmit}
          disabled={!isConnected || isPending || !amount}
          style={{
            width: '100%', padding: '0.9rem',
            background: isConnected ? '#00c8ff' : '#4a6a8a',
            color: '#050a0f', border: 'none', borderRadius: '4px',
            fontFamily: 'monospace', fontWeight: 700,
            fontSize: '0.75rem', letterSpacing: '0.1em',
            textTransform: 'uppercase', cursor: isConnected ? 'pointer' : 'not-allowed'
          }}
        >
          {!isConnected ? 'CONNECT WALLET' : isPending ? 'CONFIRMING...' : isSuccess ? '✓ SUCCESS' : action.toUpperCase()}
        </button>

        <p style={{ fontSize: '0.6rem', color: '#4a6a8a', textAlign: 'center', marginTop: '1rem' }}>
          Contract: {VAULT_ADDRESS.slice(0,6)}...{VAULT_ADDRESS.slice(-4)} · Base Sepolia
        </p>
      </div>
    </main>
  );
}
