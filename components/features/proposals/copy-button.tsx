'use client';

import { Copy } from 'lucide-react';
import { toast } from 'sonner';

import { Button, type ButtonProps } from '@/components/ui/button';

/**
 * クリップボードへの書き込みは非 HTTPS や権限拒否で失敗する。
 * 失敗しても手動コピーで回避できるよう、結果を必ず知らせる。
 */
export async function copyText(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label}をコピーしました。`);
  } catch {
    toast.error('コピーできませんでした。文字を選択してコピーしてください。');
  }
}

interface CopyButtonProps {
  text: string;
  /** トーストに出す対象の呼び名（例: 「本文」） */
  label: string;
  children?: React.ReactNode;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
}

export function CopyButton({
  text,
  label,
  children = 'コピー',
  variant = 'outline',
  size = 'sm',
}: CopyButtonProps) {
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={text.trim() === ''}
      onClick={() => {
        void copyText(text, label);
      }}
    >
      <Copy className="size-4" aria-hidden />
      {children}
    </Button>
  );
}
