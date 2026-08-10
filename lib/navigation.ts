import {
  LayoutDashboard,
  MapPinned,
  Settings,
  Sparkles,
  Store,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const DASHBOARD_NAV: readonly NavItem[] = [
  {
    href: '/dashboard',
    label: 'ダッシュボード',
    description: '進捗の概要',
    icon: LayoutDashboard,
  },
  {
    href: '/stores',
    label: '自店舗',
    description: '提案の発信元となる店舗',
    icon: Store,
  },
  {
    href: '/candidates',
    label: 'コラボ候補',
    description: '近隣から抽出した店舗',
    icon: MapPinned,
  },
  {
    href: '/proposals',
    label: '提案',
    description: 'AI が生成した提案文の管理',
    icon: Sparkles,
  },
  {
    href: '/settings',
    label: '設定',
    description: '組織・プラン・メンバー',
    icon: Settings,
  },
] as const;
