import type { Metadata } from 'next';
import Link from 'next/link';

import { signIn } from '@/app/(auth)/actions';
import { AuthForm } from '@/components/features/auth/auth-form';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export const metadata: Metadata = { title: 'ログイン' };

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const STATUS_MESSAGES: Record<string, string> = {
  confirm_email:
    '確認メールを送信しました。メール内のリンクを開くとログインできるようになります。',
  signed_out: 'ログアウトしました。',
};

const ERROR_MESSAGES: Record<string, string> = {
  missing_code: 'リンクが正しくありません。もう一度ログインしてください。',
  exchange_failed:
    'リンクの有効期限が切れているようです。もう一度ログインしてください。',
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  const status = firstValue(params.status);
  const error = firstValue(params.error);
  const redirectTo = firstValue(params.redirect_to);

  const notice = status === undefined ? undefined : STATUS_MESSAGES[status];
  const errorMessage = error === undefined ? undefined : ERROR_MESSAGES[error];

  return (
    <Card>
      <CardHeader>
        <CardTitle>ログイン</CardTitle>
        <CardDescription>
          登録済みのメールアドレスとパスワードを入力してください。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {notice === undefined ? null : (
          <p className="rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
            {notice}
          </p>
        )}
        {errorMessage === undefined ? null : (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </p>
        )}
        <AuthForm mode="signin" action={signIn} redirectTo={redirectTo} />
      </CardContent>
      <CardFooter className="justify-center text-sm text-muted-foreground">
        アカウントをお持ちでない方は
        <Link href="/signup" className="ml-1 font-medium text-primary hover:underline">
          新規登録
        </Link>
      </CardFooter>
    </Card>
  );
}
