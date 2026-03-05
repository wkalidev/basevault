import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'BaseVault',
  description: 'ERC-4626 yield vault on Base',
};

// Talent app project verification
other:  {
  "talentapp:project_verification" ; "47d55103b518dc0ea79085c69e1da15233fc3da75490f9dabcd5c4b9b68b4d644cee722a17aa985a5266669055c049b28c3bea56b7068fbb735291e7b5bd0cc2"
//  'apple-mobile-web-app-capable': 'yes',
//  'apple-mobile-web-app-status-bar-style': 'black-translucent',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
