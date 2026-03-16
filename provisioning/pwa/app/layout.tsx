import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import ZustandProvider from '@/components/ZustandProvider';
import { BottomNav } from '@/components/BottomNav';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: '3CX Provisioning',
  description: 'Provision your 3CX mobile app',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '3CX Provisioning',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
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
