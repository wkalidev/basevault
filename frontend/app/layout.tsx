import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://basevault-tan.vercel.app'),
  title: 'BaseVault PRO',
  description: 'ERC-4626 yield vault on Base — Uniswap V3 auto-rebalancing with GhostAgent AI security',
  other: {
    'talentapp:project_verification': '47d55103b518dc0ea79085c69e1da15233fc3da75490f9dabcd5c4b9b68b4d644cee722a17aa985a5266669055c049b28c3bea56b7068fbb735291e7b5bd0cc2'
  },
  icons: {
    icon: '/favicon.png',
    apple: '/favicon.png',
  },
  openGraph: {
    title: 'BaseVault PRO',
    description: 'ERC-4626 yield vault on Base — Uniswap V3 auto-rebalancing with GhostAgent AI security',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BaseVault PRO',
    description: 'ERC-4626 yield vault on Base',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}