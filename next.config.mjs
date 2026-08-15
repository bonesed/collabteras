import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Stripe Webhook の POST が末尾スラッシュ差で 307/308 されないようにする
  skipTrailingSlashRedirect: true,
  // 上位ディレクトリにも lockfile があると workspace root を誤検出するため固定する。
  outputFileTracingRoot: projectRoot,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'maps.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'places.googleapis.com',
      },
    ],
  },
};

export default nextConfig;
