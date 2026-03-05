// Types
export interface PolymarketMarket {
  id: string;
  question: string;
  outcomePrices: string;   // JSON string ex: "[0.72, 0.28]"
  volume: number;
  liquidity: number;
  endDate: string;
  active: boolean;
  outcomes: string;        // JSON string ex: '["Yes","No"]'
}

// Fetch marchés crypto actifs depuis Polymarket
export async function fetchCryptoMarkets(): Promise<PolymarketMarket[]> {
  const res = await fetch(
    'https://gamma-api.polymarket.com/markets?active=true&limit=20&tag_id=crypto',
    { next: { revalidate: 60 } } // cache 60s
  );
  if (!res.ok) throw new Error('Polymarket API error');
  return res.json();
}

// Parser les prix
export function parsePrices(outcomePrices: string): number[] {
  try { return JSON.parse(outcomePrices).map(Number); }
  catch { return [0.5, 0.5]; }
}

// Parser les outcomes
export function parseOutcomes(outcomes: string): string[] {
  try { return JSON.parse(outcomes); }
  catch { return ['Yes', 'No']; }
}
