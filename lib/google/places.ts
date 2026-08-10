import 'server-only';

import { z } from 'zod';

import { serverEnv } from '@/lib/env';
import type { NearbySearchParams, PlaceSummary } from '@/types';

const PLACES_ENDPOINT = 'https://places.googleapis.com/v1/places:searchNearby';
const GEOCODE_ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json';

/** searchNearby は 1 リクエストあたり最大 20 件しか返さない */
const MAX_RESULTS_PER_REQUEST = 20;

/**
 * 取得するフィールドを絞ることで課金 SKU を抑える。
 * 追加するときは Places API の料金表を確認すること。
 */
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.primaryTypeDisplayName',
  'places.types',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
  'places.websiteUri',
  'places.nationalPhoneNumber',
  'places.photos',
].join(',');

const localizedTextSchema = z.object({ text: z.string() });

const placeSchema = z.object({
  id: z.string(),
  displayName: localizedTextSchema.optional(),
  primaryTypeDisplayName: localizedTextSchema.optional(),
  types: z.array(z.string()).optional(),
  formattedAddress: z.string().optional(),
  location: z
    .object({ latitude: z.number(), longitude: z.number() })
    .optional(),
  rating: z.number().optional(),
  userRatingCount: z.number().optional(),
  priceLevel: z.string().optional(),
  websiteUri: z.string().optional(),
  nationalPhoneNumber: z.string().optional(),
  photos: z.array(z.object({ name: z.string() })).optional(),
});

const nearbyResponseSchema = z.object({
  places: z.array(placeSchema).optional(),
});

const geocodeResponseSchema = z.object({
  status: z.string(),
  results: z
    .array(
      z.object({
        geometry: z.object({
          location: z.object({ lat: z.number(), lng: z.number() }),
        }),
        formatted_address: z.string().optional(),
      }),
    )
    .optional(),
});

/** Places API の PRICE_LEVEL_* 文字列を 0-4 の数値に落とす */
const PRICE_LEVELS: Readonly<Record<string, number>> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

export class PlacesApiError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PlacesApiError';
  }
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** 住所から緯度経度を求める。見つからない場合は null。 */
export async function geocodeAddress(
  address: string,
): Promise<Coordinates | null> {
  const url = new URL(GEOCODE_ENDPOINT);
  url.searchParams.set('address', address);
  url.searchParams.set('language', 'ja');
  url.searchParams.set('region', 'jp');
  url.searchParams.set('key', serverEnv().GOOGLE_MAPS_API_KEY);

  const response = await fetch(url, { cache: 'no-store' });

  if (!response.ok) {
    throw new PlacesApiError(
      `住所の座標変換に失敗しました (HTTP ${response.status})`,
    );
  }

  const parsed = geocodeResponseSchema.parse(await response.json());

  if (parsed.status === 'ZERO_RESULTS') {
    return null;
  }
  if (parsed.status !== 'OK') {
    throw new PlacesApiError(`住所の座標変換に失敗しました (${parsed.status})`);
  }

  const first = parsed.results?.[0];
  if (first === undefined) {
    return null;
  }

  return {
    latitude: first.geometry.location.lat,
    longitude: first.geometry.location.lng,
  };
}

/** 指定座標の周辺にある店舗を取得する */
export async function searchNearbyPlaces(
  params: NearbySearchParams,
): Promise<PlaceSummary[]> {
  const response = await fetch(PLACES_ENDPOINT, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': serverEnv().GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      // 空配列を送るとエラーになるため、未指定のときはキーごと省いて全業種を対象にする。
      ...(params.categories.length > 0
        ? { includedTypes: params.categories }
        : {}),
      maxResultCount: Math.min(params.limit, MAX_RESULTS_PER_REQUEST),
      languageCode: 'ja',
      regionCode: 'JP',
      locationRestriction: {
        circle: {
          center: {
            latitude: params.latitude,
            longitude: params.longitude,
          },
          radius: params.radiusMeters,
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new PlacesApiError(
      `近隣店舗の取得に失敗しました (HTTP ${response.status}): ${detail}`,
    );
  }

  const parsed = nearbyResponseSchema.parse(await response.json());

  return (parsed.places ?? []).map(toPlaceSummary);
}

function toPlaceSummary(place: z.infer<typeof placeSchema>): PlaceSummary {
  const photoName = place.photos?.[0]?.name ?? null;

  return {
    placeId: place.id,
    name: place.displayName?.text ?? '(名称不明)',
    category: place.primaryTypeDisplayName?.text ?? place.types?.[0] ?? null,
    address: place.formattedAddress ?? null,
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null,
    rating: place.rating ?? null,
    userRatingsTotal: place.userRatingCount ?? null,
    priceLevel:
      place.priceLevel === undefined
        ? null
        : (PRICE_LEVELS[place.priceLevel] ?? null),
    website: place.websiteUri ?? null,
    phone: place.nationalPhoneNumber ?? null,
    // API キーを露出させないよう、写真は自前のプロキシ経由で配信する。
    photoUrl:
      photoName === null
        ? null
        : `/api/place-photo?name=${encodeURIComponent(photoName)}`,
  };
}

/** 2 地点間の距離（メートル）。Places は距離を返さないので自前で求める。 */
export function haversineDistanceMeters(
  from: Coordinates,
  to: Coordinates,
): number {
  const earthRadius = 6371000;
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLng = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(deltaLng / 2) ** 2;

  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
