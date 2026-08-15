import type { Metadata } from 'next';
import Link from 'next/link';

import { signUp } from '@/app/(auth)/actions';
import { AuthForm } from '@/components/features/auth/auth-form';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export const metadata: Metadata = { title: '新規登録' };

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default function SignUpPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>無料で始める</CardTitle>
        <CardDescription>
          クレジットカードの登録は不要です。1 店舗からお試しいただけます。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AuthForm mode="signup" action={signUp} />
      </CardContent>
      <CardFooter className="justify-center text-sm text-muted-foreground">
        すでにアカウントをお持ちの方は
        <Link href="/login" className="ml-1 font-medium text-primary hover:underline">
          ログイン
        </Link>
      </CardFooter>
    </Card>
  );
}
