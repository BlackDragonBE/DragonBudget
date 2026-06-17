// Merchant-token extraction from BNP `details` (DESIGN.md §5.2 / §6.3). Shared by
// recurring detection and rule auto-suggestion. Not perfect NLP — a stable-enough
// key to group the same merchant, which the user can refine via rules.

const BOILERPLATE = new Set([
  'BETALING', 'MET', 'DEBETKAART', 'KREDIETKAART', 'NUMMER', 'BANCONTACT', 'MAESTRO',
  'BANKREFERENTIE', 'VALUTADATUM', 'MEDEDELING', 'REFERTE', 'MANDAAT', 'EUROPESE',
  'DOMICILIERING', 'DOMICILIËRING', 'VAN', 'NAAR', 'VIA', 'CONTACTLOZE', 'KAART',
  'DATUM', 'UUR', 'REKENING', 'OVERSCHRIJVING', 'INSTANTOVERSCHRIJVING', 'EUR',
]);

// A "word" token: 2+ letters (incl. common accents/&/.'-), no digits, not an X-mask.
function isWord(t: string): boolean {
  return /^[A-ZÀ-Ÿ&.'-]{2,}$/.test(t) && !/^X+$/.test(t);
}

/** First meaningful merchant word in `details`, or null. */
export function extractMerchantToken(details: string): string | null {
  const tokens = details.toUpperCase().split(/\s+/);
  for (const t of tokens) if (isWord(t) && !BOILERPLATE.has(t)) return t;
  return null;
}

export interface KeyableTx {
  counterparty_account: string | null;
  details: string;
}

/** Stable grouping key: IBAN when present (most reliable), else merchant token. */
export function counterpartyKey(t: KeyableTx): string | null {
  if (t.counterparty_account && t.counterparty_account.trim()) {
    return 'IBAN:' + t.counterparty_account.trim().toUpperCase();
  }
  const token = extractMerchantToken(t.details);
  return token ? 'MERCH:' + token : null;
}
