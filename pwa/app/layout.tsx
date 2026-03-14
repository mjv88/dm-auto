import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import ZustandProvider from '@/components/ZustandProvider';
import { BottomNav } from '@/components/BottomNav';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Runner Hub',
  description: 'Switch your 3CX department',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Runner Hub',
  },
  icons: {
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
      { url: '/icons/apple-touch-icon-152x152.png', sizes: '152x152', type: 'image/png' },
      { url: '/icons/apple-touch-icon-120x120.png', sizes: '120x120', type: 'image/png' },
    ],
    icon: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0078D4',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body className={`${inter.className} pb-safe`}>
        <ZustandProvider>
          {children}
          <BottomNav />
        </ZustandProvider>
      </body>
    </html>
  );
}
