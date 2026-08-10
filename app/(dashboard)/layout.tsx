import Link from 'next/link';

import { Logo } from '@/components/brand/logo';
import { MobileNav } from '@/components/features/layout/mobile-nav';
import { SidebarNav } from '@/components/features/layout/sidebar-nav';
import { UserMenu } from '@/components/features/layout/user-menu';
import { Badge } from '@/components/ui/badge';
import { requireSessionContext } from '@/lib/auth';
import { PLANS } from '@/lib/constants';

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { profile, organization } = await requireSessionContext();
  const plan = PLANS[organization.plan];

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-64 shrink-0 border-r bg-muted/30 lg:flex lg:flex-col">
        <div className="flex h-16 items-center border-b px-5">
          <Link href="/dashboard">
            <Logo />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <SidebarNav />
        </div>
        <div className="border-t p-4">
          <p className="text-xs text-muted-foreground">現在のプラン</p>
          <div className="mt-1 flex items-center justify-between">
            <Badge variant="secondary">{plan.name}</Badge>
            <Link
              href="/settings/billing"
              className="text-xs font-medium text-primary hover:underline"
            >
              変更
            </Link>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b bg-background/90 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2">
            <MobileNav />
            <span className="lg:hidden">
              <Logo showWordmark={false} />
            </span>
          </div>
          <UserMenu profile={profile} organizationName={organization.name} />
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
