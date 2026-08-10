'use client';

import { LogOut, Settings } from 'lucide-react';
import Link from 'next/link';

import { signOut } from '@/app/(auth)/actions';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Profile } from '@/types';

interface UserMenuProps {
  profile: Profile;
  organizationName: string;
}

function initialOf(profile: Profile): string {
  const source = profile.full_name ?? profile.email;
  return source.slice(0, 1).toUpperCase();
}

export function UserMenu({ profile, organizationName }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto gap-2 px-2 py-1.5">
          <Avatar className="size-7">
            {profile.avatar_url === null ? null : (
              <AvatarImage src={profile.avatar_url} alt="" />
            )}
            <AvatarFallback className="text-xs">{initialOf(profile)}</AvatarFallback>
          </Avatar>
          <span className="hidden text-left sm:block">
            <span className="block text-sm font-medium leading-tight">
              {profile.full_name ?? profile.email}
            </span>
            <span className="block text-xs leading-tight text-muted-foreground">
              {organizationName}
            </span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-sm font-medium">
            {profile.full_name ?? 'ユーザー'}
          </span>
          <span className="block text-xs text-muted-foreground">{profile.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="size-4" aria-hidden />
            設定
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOut}>
          <button
            type="submit"
            className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <LogOut className="size-4" aria-hidden />
            ログアウト
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
