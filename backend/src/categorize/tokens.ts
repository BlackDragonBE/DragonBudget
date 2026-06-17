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

/** Extract meaningful 1, 2, and 3-word phrases from `details`. */
export function extractMerchantPhrases(details: string): string[] {
  const tokens = details.toUpperCase().split(/\s+/);
  const phrases: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    if (!isWord(tokens[i]) || BOILERPLATE.has(tokens[i])) continue;

    // 1-word phrase
    phrases.push(tokens[i]);

    // 2-word phrase (must be adjacent)
    if (i + 1 < tokens.length && isWord(tokens[i + 1]) && !BOILERPLATE.has(tokens[i + 1])) {
      const p2 = tokens[i] + ' ' + tokens[i + 1];
      phrases.push(p2);

      // 3-word phrase
      if (i + 2 < tokens.length && isWord(tokens[i + 2]) && !BOILERPLATE.has(tokens[i + 2])) {
        phrases.push(p2 + ' ' + tokens[i + 2]);
      }
    }
  }

  // Return unique phrases, longest first to prioritize specificity.
  return Array.from(new Set(phrases)).sort((a, b) => b.split(' ').length - a.split(' ').length || b.length - a.length);
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
