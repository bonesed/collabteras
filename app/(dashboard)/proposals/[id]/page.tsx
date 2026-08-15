import {
  ArrowLeft,
  ExternalLink,
  Footprints,
  Globe,
  MapPin,
  Phone,
  Sparkles,
  Star,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CompatibilityScoreBadge } from '@/components/features/candidates/compatibility-score-badge';
import { ProposalDetailForm } from '@/components/features/proposals/proposal-detail-form';
import { ProposalStatusControl } from '@/components/features/proposals/proposal-status-control';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireSessionContext } from '@/lib/auth';
import { COLLAB_TYPE_LABEL_MAP } from '@/lib/constants';
import { formatDateTime, formatDistance } from '@/lib/format';
import { getProposal } from '@/lib/queries/proposals';
import type { Candidate, ProposalDetail } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

interface ProposalDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: ProposalDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const { organization } = await requireSessionContext();
  const proposal = await getProposal(organization.id, id);

  return { title: proposal?.subject ?? '提案の詳細' };
}

export default async function ProposalDetailPage({
  params,
}: ProposalDetailPageProps) {
  const { id } = await params;
  const { organization } = await requireSessionContext();
  const proposal = await getProposal(organization.id, id);

  if (proposal === null) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-6xl">
      <Button variant="ghost" size="sm" className="mb-4 -ml-3" asChild>
        <Link href="/proposals">
          <ArrowLeft className="size-4" aria-hidden />
          提案一覧に戻る
        </Link>
      </Button>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {proposal.subject}
          </h1>
          <p className="text-sm text-muted-foreground">
            {proposal.store.name} から {proposal.candidate.name} へ・
            {COLLAB_TYPE_LABEL_MAP[proposal.collab_type]}
          </p>
        </div>
        <ProposalStatusControl
          proposalId={proposal.id}
          status={proposal.status}
          candidateName={proposal.candidate.name}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="pt-6">
            <ProposalDetailForm proposal={proposal} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <CandidateCard candidate={proposal.candidate} />
          <TimelineCard proposal={proposal} />
        </div>
      </div>
    </div>
  );
}

function CandidateCard({ candidate }: { candidate: Candidate }) {
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    candidate.name,
  )}&query_place_id=${candidate.google_place_id}`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-start justify-between gap-3 text-base">
          <span className="min-w-0">{candidate.name}</span>
          <CompatibilityScoreBadge score={candidate.compatibility_score} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="space-y-1.5 text-xs text-muted-foreground">
          {candidate.category === null ? null : <p>{candidate.category}</p>}
          {candidate.distance_meters === null ? null : (
            <p className="flex items-center gap-1.5">
              <Footprints className="size-3.5 shrink-0" aria-hidden />
              {formatDistance(candidate.distance_meters)}
            </p>
          )}
          {candidate.rating === null ? null : (
            <p className="flex items-center gap-1.5">
              <Star className="size-3.5 shrink-0" aria-hidden />
              {candidate.rating.toFixed(1)}
              {candidate.user_ratings_total === null
                ? null
                : `（${candidate.user_ratings_total} 件）`}
            </p>
          )}
          {candidate.address === null ? null : (
            <p className="flex items-start gap-1.5">
              <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {candidate.address}
            </p>
          )}
        </div>

        {candidate.score_reasons.length === 0 ? null : (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              AI が相性が良いと判断した理由
            </p>
            <ul className="space-y-1">
              {candidate.score_reasons.map((reason) => (
                <li key={reason} className="flex items-start gap-2 text-xs">
                  <span
                    className="mt-1.5 size-1 shrink-0 rounded-full bg-primary"
                    aria-hidden
                  />
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={mapsUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" aria-hidden />
              Google Maps
            </a>
          </Button>
          {candidate.website === null ? null : (
            <Button variant="outline" size="sm" asChild>
              <a href={candidate.website} target="_blank" rel="noreferrer">
                <Globe className="size-4" aria-hidden />
                サイト
              </a>
            </Button>
          )}
          {candidate.phone === null ? null : (
            <Button variant="outline" size="sm" asChild>
              <a href={`tel:${candidate.phone}`}>
                <Phone className="size-4" aria-hidden />
                電話
              </a>
            </Button>
          )}
        </div>

        <Button variant="secondary" size="sm" className="w-full" asChild>
          <Link
            href={`/candidates?store=${candidate.store_id}&candidate=${candidate.id}`}
          >
            <Sparkles className="size-4" aria-hidden />
            カルテを開いて書き直す
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function TimelineCard({ proposal }: { proposal: ProposalDetail }) {
  const rows: { label: string; value: string }[] = [
    { label: '作成', value: formatDateTime(proposal.created_at) },
    { label: '最終更新', value: formatDateTime(proposal.updated_at) },
  ];

  if (proposal.sent_at !== null) {
    rows.push({ label: '送付', value: formatDateTime(proposal.sent_at) });
  }
  if (proposal.replied_at !== null) {
    rows.push({ label: '返信', value: formatDateTime(proposal.replied_at) });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">経緯</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <dl className="space-y-1.5">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="tabular-nums">{row.value}</dd>
            </div>
          ))}
        </dl>

        {proposal.model === null ? null : (
          <div className="flex items-center justify-between gap-3 border-t pt-3">
            <span className="text-xs text-muted-foreground">生成モデル</span>
            <Badge variant="outline" className="font-normal">
              {proposal.model}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
