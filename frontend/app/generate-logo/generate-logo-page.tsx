'use client';

import { useEffect, useRef } from 'react';

const SVG_CONTENT = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="200" viewBox="0 0 800 200">
  <defs>
    <radialGradient id="ghostGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#a78bfa" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#7b6fff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ghostBody" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#a78bfa"/>
      <stop offset="100%" stop-color="#7b6fff"/>
    </linearGradient>
    <linearGradient id="textGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="50%" stop-color="#00c8ff"/>
      <stop offset="100%" stop-color="#a78bfa"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
      <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="softGlow">
      <feGaussianBlur stdDeviation="6" result="coloredBlur"/>
      <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="800" height="200" fill="#030810"/>
  <ellipse cx="100" cy="100" rx="80" ry="80" fill="url(#ghostGlow)"/>
  <path d="M55 95 Q55 45 100 45 Q145 45 145 95 L145 155 Q135 147 125 155 Q115 147 110 155 Q105 147 100 155 Q95 147 90 155 Q80 147 75 155 Q65 147 55 155 Z" fill="url(#ghostBody)" opacity="0.95" filter="url(#softGlow)"/>
  <path d="M65 68 Q72 55 100 52 Q128 55 135 68 Q118 62 100 64 Q82 62 65 68Z" fill="white" opacity="0.22"/>
  <ellipse cx="85" cy="92" rx="10" ry="12" fill="white"/>
  <ellipse cx="87" cy="90" rx="5" ry="6" fill="#0a0520"/>
  <circle cx="89" cy="88" r="2" fill="white"/>
  <ellipse cx="115" cy="92" rx="10" ry="12" fill="white"/>
  <ellipse cx="117" cy="90" rx="5" ry="6" fill="#0a0520"/>
  <circle cx="119" cy="88" r="2" fill="white"/>
  <ellipse cx="100" cy="114" rx="9" ry="6" fill="#0a0520" opacity="0.6"/>
  <path d="M55 142 Q62 134 70 142 Q78 150 85 142 Q92 134 100 142 Q108 150 115 142 Q122 134 130 142 Q138 150 145 142" stroke="#a78bfa" stroke-width="2.5" fill="none" opacity="0.7"/>
  <circle cx="145" cy="52" r="7" fill="#00ff9d" opacity="0.9"/>
  <circle cx="145" cy="52" r="4" fill="#00ff9d"/>
  <text x="175" y="85" font-family="'Courier New', monospace" font-size="52" font-weight="900" letter-spacing="4" fill="url(#textGrad)">BASE</text>
  <text x="175" y="145" font-family="'Courier New', monospace" font-size="52" font-weight="900" letter-spacing="4" fill="#00c8ff">VAULT</text>
  <rect x="620" y="58" width="52" height="22" rx="4" fill="rgba(0,200,255,0.12)" stroke="#00c8ff" stroke-width="1" opacity="0.9"/>
  <text x="646" y="74" font-family="'Courier New', monospace" font-size="11" font-weight="700" letter-spacing="2" fill="#00c8ff" text-anchor="middle">PRO</text>
  <text x="175" y="172" font-family="'Courier New', monospace" font-size="13" letter-spacing="3" fill="#3a5a7a">ERC-4626 · UNISWAP V3 · BASE NETWORK</text>
</svg>`;

// Favicon SVG (square, 512x512)
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="gb" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#a78bfa"/>
      <stop offset="100%" stop-color="#7b6fff"/>
    </linearGradient>
    <filter id="fg">
      <feGaussianBlur stdDeviation="8" result="coloredBlur"/>
      <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="512" height="512" fill="#030810" rx="80"/>
  <ellipse cx="256" cy="256" rx="200" ry="200" fill="#7b6fff" opacity="0.08"/>
  <path d="M100 260 Q100 100 256 100 Q412 100 412 260 L412 420 Q385 400 358 420 Q331 400 318 420 Q305 400 295 420 Q283 400 256 420 Q229 400 217 420 Q204 400 193 420 Q166 400 154 420 Q127 400 100 420 Z"
    fill="url(#gb)" opacity="0.95" filter="url(#fg)"/>
  <path d="M130 180 Q155 130 256 122 Q357 130 382 180 Q335 162 256 166 Q177 162 130 180Z"
    fill="white" opacity="0.18"/>
  <ellipse cx="190" cy="248" rx="36" ry="42" fill="white"/>
  <ellipse cx="198" cy="240" rx="18" ry="22" fill="#0a0520"/>
  <circle cx="206" cy="232" r="7" fill="white"/>
  <ellipse cx="322" cy="248" rx="36" ry="42" fill="white"/>
  <ellipse cx="330" cy="240" rx="18" ry="22" fill="#0a0520"/>
  <circle cx="338" cy="232" r="7" fill="white"/>
  <ellipse cx="256" cy="310" rx="28" ry="18" fill="#0a0520" opacity="0.5"/>
  <path d="M100 385 Q120 365 142 385 Q164 405 183 385 Q202 365 220 385 Q238 405 256 385 Q274 365 292 385 Q310 405 329 385 Q348 365 370 385 Q392 405 412 385"
    stroke="#a78bfa" stroke-width="7" fill="none" opacity="0.7"/>
  <circle cx="400" cy="118" r="24" fill="#00ff9d" opacity="0.9"/>
  <circle cx="400" cy="118" r="14" fill="#00ff9d"/>
</svg>`;

function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function svgToCanvas(svgString: string, width: number, height: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.src = url;
  });
}

export default function GenerateLogo() {
  const logoRef   = useRef<HTMLCanvasElement>(null);
  const faviconRef = useRef<HTMLCanvasElement>(null);
  const ogRef     = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Logo 800x200
    svgToCanvas(SVG_CONTENT, 800, 200).then(canvas => {
      const ctx = logoRef.current?.getContext('2d');
      if (ctx) ctx.drawImage(canvas, 0, 0);
    });
    // Favicon 512x512
    svgToCanvas(FAVICON_SVG, 512, 512).then(canvas => {
      const ctx = faviconRef.current?.getContext('2d');
      if (ctx) ctx.drawImage(canvas, 0, 0);
    });
    // OG Image 1200x630
    svgToCanvas(SVG_CONTENT, 1200, 300).then(canvas => {
      const ogCanvas = ogRef.current;
      if (!ogCanvas) return;
      ogCanvas.width  = 1200;
      ogCanvas.height = 630;
      const ctx = ogCanvas.getContext('2d')!;
      ctx.fillStyle = '#030810';
      ctx.fillRect(0, 0, 1200, 630);
      ctx.drawImage(canvas, 200, 165, 800, 300);
    });
  }, []);

  const btnStyle: React.CSSProperties = {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.1em',
    padding: '0.6rem 1.2rem',
    border: '1px solid #00c8ff',
    background: 'rgba(0,200,255,0.1)',
    color: '#00c8ff',
    borderRadius: '6px',
    cursor: 'pointer',
    textTransform: 'uppercase' as const,
  };

  return (
    <div style={{ background: '#030810', minHeight: '100vh', padding: '2rem', fontFamily: "'JetBrains Mono', monospace" }}>
      <h1 style={{ color: '#00c8ff', fontSize: '1rem', letterSpacing: '0.2em', marginBottom: '2rem', textTransform: 'uppercase' }}>
        BaseVault Logo Generator
      </h1>

      {/* Logo 800x200 */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ color: '#3a5a7a', fontSize: '0.6rem', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '0.8rem' }}>Logo · 800×200</div>
        <canvas ref={logoRef} width={800} height={200} style={{ border: '1px solid rgba(0,200,255,0.2)', borderRadius: '8px', display: 'block', marginBottom: '0.8rem', maxWidth: '100%' }} />
        <button style={btnStyle} onClick={() => logoRef.current && downloadCanvas(logoRef.current, 'basevault-logo.png')}>
          ↓ Download Logo PNG
        </button>
      </div>

      {/* Favicon */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ color: '#3a5a7a', fontSize: '0.6rem', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '0.8rem' }}>Favicon · 512×512</div>
        <canvas ref={faviconRef} width={512} height={512} style={{ border: '1px solid rgba(0,200,255,0.2)', borderRadius: '8px', display: 'block', marginBottom: '0.8rem', width: '200px', height: '200px' }} />
        <button style={btnStyle} onClick={() => faviconRef.current && downloadCanvas(faviconRef.current, 'favicon.png')}>
          ↓ Download Favicon PNG
        </button>
      </div>

      {/* OG Image */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ color: '#3a5a7a', fontSize: '0.6rem', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '0.8rem' }}>OG Image · 1200×630</div>
        <canvas ref={ogRef} width={1200} height={630} style={{ border: '1px solid rgba(0,200,255,0.2)', borderRadius: '8px', display: 'block', marginBottom: '0.8rem', maxWidth: '100%' }} />
        <button style={btnStyle} onClick={() => ogRef.current && downloadCanvas(ogRef.current, 'og-image.png')}>
          ↓ Download OG Image PNG
        </button>
      </div>

      <div style={{ color: '#3a5a7a', fontSize: '0.55rem', lineHeight: 2 }}>
        <div>1. Téléchargez les 3 fichiers</div>
        <div>2. Placez favicon.png dans frontend/public/</div>
        <div>3. Placez og-image.png dans frontend/public/</div>
        <div>4. Mettez à jour layout.tsx avec les meta tags</div>
      </div>
    </div>
  );
}