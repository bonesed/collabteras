'use client';

import { CreditCard, Loader2 } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';

import {
  openBillingPortal,
  startCheckout,
} from '@/app/(dashboard)/settings/billing/actions';
import { Button, type ButtonProps } from '@/components/ui/button';
import type { ActionResult } from '@/types';

/**
 * Stripe が返した URL へブラウザごと遷移する。
 * Checkout もカスタマーポータルも Stripe のホスト上で完結する。
 */
function useStripeRedirect() {
  const [isPending, startTransition] = useTransition();

  function go(
    createSession: () => Promise<ActionResult<{ url: string }>>,
  ): void {
    startTransition(async () => {
      const result = await createSession();

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      window.location.href = result.data.url;
    });
  }

  return { isPending, go };
}

interface CheckoutButtonProps {
  planTier: string;
  label: string;
  variant?: ButtonProps['variant'];
  disabled?: boolean;
}

export function CheckoutButton({
  planTier,
  label,
  variant = 'default',
  disabled = false,
}: CheckoutButtonProps) {
  const { isPending, go } = useStripeRedirect();

  return (
    <Button
      type="button"
      variant={variant}
      className="w-full"
      disabled={disabled || isPending}
      onClick={() => go(() => startCheckout(planTier))}
    >
      {isPending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : null}
      {isPending ? '決済ページへ移動中…' : label}
    </Button>
  );
}

export function BillingPortalButton({ disabled = false }: { disabled?: boolean }) {
  const { isPending, go } = useStripeRedirect();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled || isPending}
      onClick={() => go(openBillingPortal)}
    >
      {isPending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <CreditCard className="size-4" aria-hidden />
      )}
      {isPending ? '移動中…' : 'お支払い情報を管理'}
    </Button>
  );
}
