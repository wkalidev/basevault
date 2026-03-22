'use client';

import { useAccount, useWriteContract, useWalletClient, usePublicClient } from 'wagmi';
import { parseEther, parseUnits, formatEther, formatUnits, encodeFunctionData } from 'viem';
import { useState, useEffect, useCallback } from 'react';
import { baseSepolia } from 'wagmi/chains';

// ── TOKEN CONFIG ─────────────────────────────────────────────
const TOKENS = {
  ETH:  { address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, symbol: 'ETH',  name: 'Ethereum',        color: '#00c8ff' },
  WETH: { address: '0x4200000000000000000000000000000000000006', decimals: 18, symbol: 'WETH', name: 'Wrapped Ether',    color: '#a78bfa' },
  USDC: { address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', decimals: 6,  symbol: 'USDC', name: 'USD Coin',         color: '#00ff9d' },
} as const;

type TokenSymbol = keyof typeof TOKENS;

const WETH_ABI = [
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

interface QuoteResult {
  buyAmount: string;
  sellAmount: string;
  price: string;
  estimatedGas: string;
  to: string;
  data: string;
  value: string;
  allowanceTarget: string;
  priceImpact?: string;
}

function sanitizeAmount(val: string): string {
  const cleaned = val.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length > 2) return parts[0] + '.' + parts[1];
  if (parts[1]?.length > 18) return parts[0] + '.' + parts[1].slice(0, 18);
  return cleaned;
}

export function SwapTab() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [fromToken, setFromToken] = useState<TokenSymbol>('ETH');
  const [toToken,   setToToken]   = useState<TokenSymbol>('USDC');
  const [fromAmt,   setFromAmt]   = useState('');
  const [slippage,  setSlippage]  = useState('0.5');
  const [quote,     setQuote]     = useState<QuoteResult | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [swapping,  setSwapping]  = useState(false);
  const [error,     setError]     = useState('');
  const [txHash,    setTxHash]    = useState('');
  const [status,    setStatus]    = useState('');

  // ── FETCH QUOTE ───────────────────────────────────────────
  const fetchQuote = useCallback(async () => {
    if (!fromAmt || parseFloat(fromAmt) <= 0) { setQuote(null); return; }

    setLoading(true);
    setError('');
    setQuote(null);

    try {
      const fromConfig = TOKENS[fromToken];
      const toConfig   = TOKENS[toToken];
      const sellAmount = fromToken === 'USDC'
        ? parseUnits(fromAmt, 6).toString()
        : parseEther(fromAmt).toString();

      const params = new URLSearchParams({
        chainId:     '84532',
        sellToken:   fromConfig.address,
        buyToken:    toConfig.address,
        sellAmount,
        slippagePercentage: (parseFloat(slippage) / 100).toString(),
        ...(address ? { takerAddress: address } : {}),
      });

      const res = await fetch(`https://api.0x.org/swap/v1/quote?${params}`, {
        headers: { '0x-api-key': process.env.NEXT_PUBLIC_0X_API_KEY ?? '' },
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.reason ?? 'Quote failed');
      }

      const data = await res.json();
      setQuote({
        buyAmount:       data.buyAmount,
        sellAmount:      data.sellAmount,
        price:           data.price,
        estimatedGas:    data.estimatedGas,
        to:              data.to,
        data:            data.data,
        value:           data.value ?? '0',
        allowanceTarget: data.allowanceTarget,
        priceImpact:     data.estimatedPriceImpact,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch quote';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [fromAmt, fromToken, toToken, slippage, address]);

  useEffect(() => {
    const timer = setTimeout(() => { if (fromAmt) fetchQuote(); }, 600);
    return () => clearTimeout(timer);
  }, [fromAmt, fromToken, toToken, slippage, fetchQuote]);

  // ── EXECUTE SWAP ──────────────────────────────────────────
  const executeSwap = async () => {
    if (!quote || !walletClient || !address || !publicClient) return;
    setSwapping(true);
    setError('');
    setTxHash('');

    try {
      // If not ETH, approve allowance first
      if (fromToken !== 'ETH' && quote.allowanceTarget !== '0x0000000000000000000000000000000000000000') {
        setStatus('Approving token...');
        const allowance = await publicClient.readContract({
          address: TOKENS[fromToken].address as `0x${string}`,
          abi: WETH_ABI,
          functionName: 'allowance',
          args: [address, quote.allowanceTarget as `0x${string}`],
        });

        const sellAmt = fromToken === 'USDC'
          ? parseUnits(fromAmt, 6)
          : parseEther(fromAmt);

        if ((allowance as bigint) < sellAmt) {
          const approveTx = await walletClient.writeContract({
            address: TOKENS[fromToken].address as `0x${string}`,
            abi: WETH_ABI,
            functionName: 'approve',
            args: [quote.allowanceTarget as `0x${string}`, sellAmt],
          });
          setStatus('Waiting for approval...');
          await publicClient.waitForTransactionReceipt({ hash: approveTx });
        }
      }

      setStatus('Sending swap...');
      const hash = await walletClient.sendTransaction({
        to:    quote.to as `0x${string}`,
        data:  quote.data as `0x${string}`,
        value: BigInt(quote.value),
      });

      setTxHash(hash);
      setStatus('Waiting for confirmation...');
      await publicClient.waitForTransactionReceipt({ hash });
      setStatus('✅ Swap confirmed!');
      setFromAmt('');
      setQuote(null);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Swap failed';
      setError(msg.slice(0, 120));
      setStatus('');
    } finally {
      setSwapping(false);
    }
  };

  const toAmt = quote
    ? formatUnits(BigInt(quote.buyAmount), TOKENS[toToken].decimals)
    : '';

  const btnDisabled = !isConnected || !quote || loading || swapping || !fromAmt;

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '0.65rem', letterSpacing: '0.15em', color: '#a78bfa', textTransform: 'uppercase' }}>⇄ Swap — Powered by 0x</span>
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            {['0.1', '0.5', '1.0'].map(s => (
              <button key={s} onClick={() => setSlippage(s)} style={{ fontFamily: 'var(--mono)', fontSize: '0.52rem', padding: '0.2rem 0.5rem', borderRadius: '3px', border: `1px solid ${slippage === s ? '#a78bfa' : 'var(--border)'}`, background: slippage === s ? 'rgba(167,139,250,0.1)' : 'transparent', color: slippage === s ? '#a78bfa' : 'var(--muted)', cursor: 'pointer' }}>{s}%</button>
            ))}
          </div>
        </div>

        {/* From */}
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem', marginBottom: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '0.52rem', color: 'var(--muted)' }}>FROM</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <input type="number" placeholder="0.0" value={fromAmt}
              onChange={e => setFromAmt(sanitizeAmount(e.target.value))}
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: 'var(--mono)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--text)' }} />
            <select value={fromToken} onChange={e => setFromToken(e.target.value as TokenSymbol)}
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.3rem 0.5rem', fontFamily: 'var(--mono)', fontSize: '0.7rem', color: 'var(--text)', cursor: 'pointer' }}>
              {Object.keys(TOKENS).map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {/* Flip arrow */}
        <div style={{ textAlign: 'center', margin: '0.4rem 0', cursor: 'pointer' }}
          onClick={() => { setFromToken(toToken); setToToken(fromToken); setFromAmt(''); setQuote(null); }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '1rem', color: '#a78bfa' }}>⇅</span>
        </div>

        {/* To */}
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '0.52rem', color: 'var(--muted)' }}>TO</span>
            {quote && <span style={{ fontFamily: 'var(--mono)', fontSize: '0.52rem', color: 'var(--green)' }}>
              1 {fromToken} ≈ {parseFloat(quote.price).toFixed(4)} {toToken}
            </span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <div style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: '1.4rem', fontWeight: 700, color: loading ? 'var(--muted)' : toAmt ? 'var(--green)' : 'var(--muted)' }}>
              {loading ? '...' : toAmt ? parseFloat(toAmt).toFixed(6) : '0.0'}
            </div>
            <select value={toToken} onChange={e => setToToken(e.target.value as TokenSymbol)}
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.3rem 0.5rem', fontFamily: 'var(--mono)', fontSize: '0.7rem', color: 'var(--text)', cursor: 'pointer' }}>
              {Object.keys(TOKENS).map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {/* Quote details */}
        {quote && !loading && (
          <div style={{ background: 'rgba(167,139,250,0.04)', border: '1px solid rgba(167,139,250,0.15)', borderRadius: '6px', padding: '0.8rem', marginBottom: '1rem' }}>
            {[
              { label: 'Price Impact',  val: quote.priceImpact ? `${parseFloat(quote.priceImpact).toFixed(2)}%` : '<0.01%', color: 'var(--green)' },
              { label: 'Slippage',      val: `${slippage}%`,   color: 'var(--muted)' },
              { label: 'Est. Gas',      val: parseInt(quote.estimatedGas).toLocaleString(), color: 'var(--muted)' },
              { label: 'Route',         val: `0x Protocol`,    color: '#a78bfa' },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.15rem 0' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '0.58rem', color: 'var(--muted)' }}>{r.label}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '0.58rem', color: r.color }}>{r.val}</span>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ background: 'rgba(255,107,53,0.08)', border: '1px solid rgba(255,107,53,0.3)', borderRadius: '6px', padding: '0.6rem 0.8rem', marginBottom: '0.8rem' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '0.6rem', color: 'var(--orange)' }}>⚠ {error}</span>
          </div>
        )}

        {/* Status */}
        {status && (
          <div style={{ background: 'rgba(0,255,157,0.04)', border: '1px solid rgba(0,255,157,0.2)', borderRadius: '6px', padding: '0.6rem 0.8rem', marginBottom: '0.8rem' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '0.6rem', color: 'var(--green)' }}>{status}</span>
          </div>
        )}

        {/* Tx hash */}
        {txHash && (
          <div style={{ marginBottom: '0.8rem' }}>
            <a href={`https://sepolia.basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer"
              style={{ fontFamily: 'var(--mono)', fontSize: '0.58rem', color: 'var(--blue)', textDecoration: 'none' }}>
              ↗ View on BaseScan: {txHash.slice(0, 16)}...
            </a>
          </div>
        )}

        {/* Swap button */}
        <button onClick={executeSwap} disabled={btnDisabled}
          style={{ width: '100%', padding: '0.85rem', fontFamily: 'var(--mono)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', border: 'none', borderRadius: '6px', background: btnDisabled ? 'var(--muted)' : '#a78bfa', color: 'var(--bg)', cursor: btnDisabled ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}>
          {!isConnected ? '🔒 Connect Wallet'
            : swapping ? `⟳ ${status || 'Swapping...'}`
            : loading  ? '⟳ Fetching Quote...'
            : !fromAmt ? 'Enter Amount'
            : !quote   ? 'Get Quote'
            : `⇄ Swap ${fromToken} → ${toToken}`}
        </button>

        <p style={{ fontFamily: 'var(--mono)', fontSize: '0.5rem', color: 'var(--muted)', textAlign: 'center', marginTop: '0.8rem' }}>
          Best price routing via 0x Protocol · Base Sepolia
        </p>
      </div>
    </div>
  );
}