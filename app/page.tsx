import { ArrowRight, MapPin, Sparkles, Store as StoreIcon } from 'lucide-react';
import Link from 'next/link';

import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { APP_NAME, PLANS } from '@/lib/constants';

const STEPS = [
  {
    icon: StoreIcon,
    title: '自店舗を登録する',
    description:
      '店名・業種・立地・強み・来てほしいお客様像を入力します。入力は最短 1 分です。',
  },
  {
    icon: MapPin,
    title: '近隣の候補を自動抽出',
    description:
      'Google Maps と Web の情報から、徒歩圏の店舗を集めて相性をスコアリングします。',
  },
  {
    icon: Sparkles,
    title: 'AI が提案文を書く',
    description:
      '相手のお店に合わせたコラボ企画と、そのまま送れる挨拶文を生成します。',
  },
] as const;

export default function LandingPage() {
  const plans = [PLANS.free, PLANS.light, PLANS.standard, PLANS.pro];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/login">ログイン</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">無料で始める</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="container flex flex-col items-center gap-6 py-20 text-center md:py-28">
          <span className="rounded-full border bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
            近隣店舗コラボの、最初の一歩を自動化
          </span>
          <h1 className="max-w-3xl text-balance text-3xl font-bold leading-tight tracking-tight sm:text-4xl md:text-5xl md:leading-tight">
            <span className="block">
              相性の良い近隣店を
              <br className="sm:hidden" />
              AIが自動リサーチ。
            </span>
            <span className="block">
              コラボ企画と提案文を、
              <br className="sm:hidden" />
              <span className="text-primary">1分で作成。</span>
            </span>
          </h1>
          <p className="max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
            {APP_NAME} は、徒歩圏にある相性の良い店舗を自動で洗い出し、
            そのお店に合わせたコラボ企画と提案文をまとめて用意します。
            送付状況の管理まで、ひとつの画面で完結します。
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/signup">
                無料で始める
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/login">アカウントをお持ちの方</Link>
            </Button>
          </div>
        </section>

        <section className="border-y bg-muted/40 py-16">
          <div className="container">
            <h2 className="text-center text-2xl font-semibold tracking-tight">
              使い方は 3 ステップ
            </h2>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <Card key={step.title} className="border-none shadow-sm">
                  <CardHeader className="gap-3">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <step.icon className="size-5" aria-hidden />
                    </span>
                    <CardTitle className="text-lg">
                      <span className="mr-2 text-sm font-medium text-muted-foreground">
                        0{index + 1}
                      </span>
                      {step.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm leading-relaxed text-muted-foreground">
                    {step.description}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="container py-16" id="pricing">
          <h2 className="text-center text-2xl font-semibold tracking-tight">
            料金プラン
          </h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            まずは無料で、コラボ候補の見え方をお確かめください。
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => (
              <Card key={plan.tier} className="flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-baseline justify-between">
                    <span>{plan.name}</span>
                    <span className="text-2xl font-bold">
                      {plan.monthlyPriceJpy === 0
                        ? '¥0'
                        : `¥${plan.monthlyPriceJpy.toLocaleString('ja-JP')}`}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        /月
                      </span>
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                  <ul className="flex-1 space-y-2 text-sm">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <span
                          className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                          aria-hidden
                        />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button
                    variant={plan.tier === 'standard' ? 'default' : 'outline'}
                    asChild
                  >
                    <Link href="/signup">このプランで始める</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="container flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row">
          <Logo />
          <p>&copy; {new Date().getFullYear()} {APP_NAME}</p>
        </div>
      </footer>
    </div>
  );
}
