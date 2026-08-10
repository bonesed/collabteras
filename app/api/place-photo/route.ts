import { NextResponse, type NextRequest } from 'next/server';

import { serverEnv } from '@/lib/env';
import { getCurrentUserId } from '@/lib/auth';

const PHOTO_NAME_PATTERN = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

/**
 * Places の写真を配信するプロキシ。
 * API キーをクライアントに渡さないために挟んでいる。`name` は Places API が
 * 返すリソース名以外を受け付けない（任意の URL を踏ませないため）。
 */
export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (userId === null) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const name = request.nextUrl.searchParams.get('name');

  if (name === null || !PHOTO_NAME_PATTERN.test(name)) {
    return new NextResponse('Bad Request', { status: 400 });
  }

  const upstream = new URL(`https://places.googleapis.com/v1/${name}/media`);
  upstream.searchParams.set('maxWidthPx', '400');
  upstream.searchParams.set('key', serverEnv().GOOGLE_MAPS_API_KEY);

  const response = await fetch(upstream, { cache: 'no-store' });

  if (!response.ok) {
    return new NextResponse('Not Found', { status: 404 });
  }

  return new NextResponse(response.body, {
    headers: {
      'Content-Type': response.headers.get('Content-Type') ?? 'image/jpeg',
      'Cache-Control': 'private, max-age=86400',
    },
  });
}
