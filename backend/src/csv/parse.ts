import { parse } from 'csv-parse/sync';

// BNP Paribas Fortis "Easy Banking" CSV export shape (DESIGN.md §4.1).
export const EXPECTED_HEADERS = [
  'Volgnummer', 'Uitvoeringsdatum', 'Valutadatum', 'Bedrag', 'Valuta rekening',
  'Rekeningnummer', 'Type verrichting', 'Tegenpartij', 'Naam van de tegenpartij',
  'Mededeling', 'Details', 'Status', 'Reden van weigering',
] as const;

export class CsvFormatError extends Error {}

export interface ParsedTransaction {
  execution_date: string | null;
  value_date: string | null;
  amount_cents: number;
  currency: string;
  account_number: string;
  transaction_type: string;
  counterparty_account: string | null;
  counterparty_name: string | null;
  message: string | null;
  details: string;
  status: 'accepted' | 'rejected';
  rejection_reason: string | null;
}

const nullable = (s: string): string | null => (s.trim() === '' ? null : s.trim());

// DD/MM/YYYY -> ISO YYYY-MM-DD; empty -> null.
function toIsoDate(s: string, row: number, field: string): string | null {
  const t = s.trim();
  if (t === '') return null;
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) throw new CsvFormatError(`Row ${row}: invalid date in "${field}": "${t}"`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// "-1900.00" / "2750,00" -> integer cents. Never store the float.
function toCents(s: string, row: number): number {
  const f = parseFloat(s.trim().replace(',', '.'));
  if (Number.isNaN(f)) throw new CsvFormatError(`Row ${row}: invalid amount "${s}"`);
  return Math.round(f * 100);
}

function mapStatus(s: string): 'accepted' | 'rejected' {
  return s.trim().toLowerCase().startsWith('geweiger') ? 'rejected' : 'accepted';
}

/** Parse a BNP CSV (string) into validated transactions. Throws CsvFormatError. */
export function parseBnpCsv(content: string): ParsedTransaction[] {
  let records: Record<string, string>[];
  try {
    records = parse(content, {
      delimiter: ';',
      bom: true, // strips the UTF-8 BOM
      skip_empty_lines: true,
      relax_column_count: true,
      trim: false,
      columns: (header: string[]) => {
        const norm = header.map((h) => h.trim());
        const missing = EXPECTED_HEADERS.filter((h) => !norm.includes(h));
        if (missing.length) {
          throw new CsvFormatError(
            `Unexpected CSV format — missing columns: ${missing.join(', ')}. ` +
              `Is this a BNP Paribas Fortis Easy Banking export?`,
          );
        }
        return norm;
      },
    });
  } catch (e) {
    if (e instanceof CsvFormatError) throw e;
    throw new CsvFormatError(`Could not parse CSV: ${(e as Error).message}`);
  }

  return records.map((r, i) => {
    const row = i + 2; // +1 header, +1 to 1-based
    const get = (k: string) => r[k] ?? '';
    // Field types are guaranteed by the converters above: toIsoDate / toCents
    // throw CsvFormatError on bad input, mapStatus returns the union, `?? 'EUR'`
    // fills currency. No second validation pass needed.
    const parsed: ParsedTransaction = {
      execution_date: toIsoDate(get('Uitvoeringsdatum'), row, 'Uitvoeringsdatum'),
      value_date: toIsoDate(get('Valutadatum'), row, 'Valutadatum'),
      amount_cents: toCents(get('Bedrag'), row),
      currency: nullable(get('Valuta rekening')) ?? 'EUR',
      account_number: get('Rekeningnummer').trim(),
      transaction_type: get('Type verrichting').trim(),
      counterparty_account: nullable(get('Tegenpartij')),
      counterparty_name: nullable(get('Naam van de tegenpartij')),
      message: nullable(get('Mededeling')),
      details: get('Details').trim(),
      status: mapStatus(get('Status')),
      rejection_reason: nullable(get('Reden van weigering')),
    };
    return parsed;
  });
}
