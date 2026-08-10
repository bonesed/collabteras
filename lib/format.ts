const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(isoString: string): string {
  return dateFormatter.format(new Date(isoString));
}

export function formatDateTime(isoString: string): string {
  return dateTimeFormatter.format(new Date(isoString));
}

/** 1km 未満は m、それ以上は小数第 1 位までの km で表示する */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `徒歩圏 ${meters} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatJpy(amount: number): string {
  return `¥${amount.toLocaleString('ja-JP')}`;
}
