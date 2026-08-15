import type { Metadata, Viewport } from 'next';

import { Toaster } from '@/components/ui/sonner';
import { APP_NAME, APP_TAGLINE } from '@/lib/constants';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} | ${APP_TAGLINE}`,
    template: `%s | ${APP_NAME}`,
  },
  description:
    '近隣エリアの相性が良い店舗を自動で抽出し、AI がそのままお店に送れるコラボ提案文を生成する、店舗向けの集客支援 SaaS です。',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body className="min-h-dvh font-sans">
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
