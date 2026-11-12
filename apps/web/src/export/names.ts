/** File and ID naming shared by the spreadsheet and the archive. */

export function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

export function exportFileName(year: number, date: Date): string {
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `UVL-Expenses-${year}-${iso}.xlsx`;
}

export function archiveFileName(year: number): string {
  return `UVL-Expenses-${year}-Archive.zip`;
}
