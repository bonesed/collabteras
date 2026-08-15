/** Excel でも文字化けしないよう、先頭に BOM を付ける。 */
const CSV_BOM = '\uFEFF';

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(headers: readonly string[], rows: readonly string[][]): string {
  const lines = [headers, ...rows].map((row) =>
    row.map((cell) => escapeCsvField(cell)).join(','),
  );
  return `${CSV_BOM}${lines.join('\r\n')}\r\n`;
}

export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}
