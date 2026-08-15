import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { createOrganization } from '@/app/onboarding/actions';
import { Logo } from '@/components/brand/logo';
import { OnboardingForm } from '@/components/features/onboarding/onboarding-form';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'はじめに' };

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user === null) {
    redirect('/login');
  }

  // 既に組織があるならオンボーディングは不要。
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (membership !== null) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-muted/40 px-4 py-12">
      <Logo />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>組織を作成しましょう</CardTitle>
          <CardDescription>
            店舗を運営する会社名や屋号を入力してください。あとから変更できます。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingForm action={createOrganization} />
        </CardContent>
      </Card>
    </div>
  );
}
