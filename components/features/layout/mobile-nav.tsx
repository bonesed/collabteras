'use client';

import { Menu } from 'lucide-react';
import { useState } from 'react';

import { Logo } from '@/components/brand/logo';
import { SidebarNav } from '@/components/features/layout/sidebar-nav';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden">
          <Menu className="size-5" aria-hidden />
          <span className="sr-only">メニューを開く</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="top-0 max-w-xs translate-y-0 gap-6 rounded-none border-l-0 sm:rounded-lg">
        <DialogTitle asChild>
          <div>
            <Logo />
          </div>
        </DialogTitle>
        <SidebarNav onNavigate={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
