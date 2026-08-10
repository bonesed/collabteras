import 'server-only';

import Stripe from 'stripe';

import { serverEnv } from '@/lib/env';

let cachedClient: Stripe | null = null;

/**
 * Stripe を設定していなくてもアプリ全体は動く必要がある（開発中・無料運用中）。
 * 課金の導線を出すかどうかは、呼び出し側でこれを見て判断する。
 */
export function isStripeConfigured(): boolean {
  return serverEnv().STRIPE_SECRET_KEY !== undefined;
}

export function getStripe(): Stripe {
  const secretKey = serverEnv().STRIPE_SECRET_KEY;

  if (secretKey === undefined) {
    throw new Error('STRIPE_SECRET_KEY が設定されていません。');
  }

  if (cachedClient === null) {
    cachedClient = new Stripe(secretKey, { typescript: true });
  }

  return cachedClient;
}
