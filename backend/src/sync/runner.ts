import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright';

// Live, user-facing step of an in-progress sync.
export type SyncStep =
  | 'launching'
  | 'navigating'
  | 'logging_in'
  | 'waiting_itsme'
  | 'navigating_account'
  | 'downloading';
export type OnStatus = (step: SyncStep) => void;

export interface BankCreds {
  gsm: string;          // GSM number used for itsme login
  client: string;       // Klantnummer (client number)
  accountLabel: string; // the account link text to open, e.g. "VAN DE KERCKHOVE E"
}

// A balance scraped off the accounts-list page (current + savings).
export interface BankAccount {
  name: string;
  iban: string | null;
  type: string | null;
  balanceCents: number | null;
  currency: string | null;
}

// On-screen Belgian amount → integer cents. "514,62"→51462, "6.371,66"→637166,
// "-19,00"→-1900, "€ 0,00"→0. Drops "." thousands separators (so toCents in
// parse.ts can't be reused), treats "," as decimal. null on garbage.
export function parseBalance(text: string | null): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
  const f = parseFloat(cleaned);
  return Number.isNaN(f) ? null : Math.round(f * 100);
}

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
// Persisted Chromium profile so itsme "trust this device" + cookie consent
// survive restarts (lives under the /data volume mount in Docker).
const PROFILE_DIR = path.join(DATA_DIR, 'playwright-profile');

const LOGON_URL = 'https://www.bnpparibasfortis.be/nl/generic/logon';
const ACCOUNTS_URL = 'https://www.bnpparibasfortis.be/nl/secured/accounts/my-accounts-list#target.ia.home.showHome';

/**
 * Log into Easy Banking Web (user confirms via itsme on their phone), export the
 * last 3 months of transactions for the chosen account as CSV, and return its text.
 *
 * Throws on any failure — the caller turns that into an `error` job status so a
 * UI change at the bank surfaces loudly instead of silently importing nothing.
 *
 * Steps derived from a `playwright codegen` recording; selectors are role/label
 * based where possible. The CSV-options modal step uses a positional selector and
 * is the most likely thing to break if BNPPF changes the export dialog.
 */
export async function runSync(creds: BankCreds, onStatus: OnStatus): Promise<{ csv: string; accounts: BankAccount[] }> {
  onStatus('launching');
  fs.mkdirSync(PROFILE_DIR, { recursive: true });

  // Headed by default: BNPPF blocks headless Chromium (bot detection). On a desktop
  // this uses the real display; in Docker it runs under xvfb (see Dockerfile CMD).
  // SYNC_HEADLESS=true forces headless only if you want to test that path.
  // --no-sandbox: Chromium runs as root in the container, where its sandbox can't
  // start — without this the launch hangs. --disable-dev-shm-usage: /dev/shm is
  // tiny in containers. Both are harmless on a desktop. (Verified in-container.)
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: process.env.SYNC_HEADLESS === 'true',
    acceptDownloads: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    page.setDefaultTimeout(30_000);

    // --- Login ---
    // 'commit' (resolves once the response arrives), not the default 'load': the
    // bank page keeps connections open (trackers/long-poll) so 'load' /
    // 'domcontentloaded' may never fire. Element locators below auto-wait for the
    // actual fields, so we don't need the page to be fully "loaded".
    onStatus('navigating');
    await page.goto(LOGON_URL, { waitUntil: 'commit', timeout: 60_000 });
    // Cookie banner only appears on a fresh profile — ignore if absent.
    await page.getByRole('button', { name: 'Alle cookies aanvaarden' })
      .click({ timeout: 5_000 }).catch(() => {});

    onStatus('logging_in');
    await page.getByRole('textbox', { name: 'Vul uw gsm-nummer in' }).fill(creds.gsm);
    await page.getByRole('textbox', { name: 'Klantnummer' }).fill(creds.client);
    await page.getByRole('button', { name: 'Aanmelden met itsme' }).click();

    // Push is now on the user's phone — wait (generously) for the redirect into
    // the secured area after they confirm.
    onStatus('waiting_itsme');
    await page.waitForURL('**/secured/**', { timeout: 180_000 });

    // --- Navigate to the account and export the last 3 months as CSV ---
    onStatus('navigating_account');
    await page.goto(ACCOUNTS_URL, { waitUntil: 'commit', timeout: 60_000 });
    // Wait for the rivets-rendered list (the account link auto-waits on the click
    // below; this just lets us scrape balances before drilling in).
    await page.getByRole('link', { name: creds.accountLabel, exact: true }).waitFor();

    // ponytail: balance scrape is best-effort; selectors from page HTML, [] on miss.
    // The current + savings accounts (and their live balances) are all on this list
    // page — read them before clicking into one. A UI change here must not abort the
    // sync, so this is wrapped and never throws.
    const accounts = await scrapeAccounts(page);

    await page.getByRole('link', { name: creds.accountLabel, exact: true }).click();
    await page.getByRole('link', { name: 'Zoeken Zoek en exporteer' }).click();

    onStatus('downloading');
    await page.getByRole('textbox', { name: 'Zoek op bedrag, datum, naam,' }).click();
    // Rolling last-3-months window via the "Tussen <from> en <to>" date filter.
    // Rolling beats whole-year: no year-boundary gap and a smaller export; dedup
    // makes the overlap with the previous sync harmless.
    const { from, to } = last3Months();
    await page.getByRole('link', { name: 'Tussendd/mm/jjjj endd/mm/jjjj' }).click();
    await page.locator('#firstInput').fill(from);
    await page.locator('#firstInput').press('Tab');
    await page.locator('#secondInput').fill(to);
    await page.locator('.fontcon-search').click();
    // Start listening before the click that triggers the download. Clicking "CSV"
    // opens the export dialog (or downloads directly); a "Bevestigen" confirm may or
    // may not appear, so click it best-effort. The number format is remembered in the
    // persistent profile; parse.ts tolerates comma decimals (only a thousands
    // separator would break it), so no per-export format click is needed.
    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await page.getByRole('link', { name: 'CSV' }).click();
    await page.getByRole('button', { name: 'Bevestigen' }).click({ timeout: 5_000 }).catch(() => {});
    const download = await downloadPromise;

    const downloadPath = await download.path();
    // Match the manual-upload path, which reads the CSV as UTF-8.
    const csv = await fs.promises.readFile(downloadPath, 'utf8');
    return { csv, accounts };
  } catch (err) {
    // Production runs headless under xvfb, so a selector that breaks (BNPPF UI
    // change, skipped login step, covering consent banner) is otherwise invisible.
    // Dump what the browser is actually showing to the /data volume so the failure
    // can be diagnosed precisely instead of guessed at. Best-effort; never masks err.
    await dumpFailure(ctx).catch(() => {});
    throw err;
  } finally {
    await ctx.close();
  }
}

// Save a screenshot + raw HTML of the current page to DATA_DIR on a sync failure.
async function dumpFailure(ctx: import('playwright').BrowserContext): Promise<void> {
  const page = ctx.pages()[0];
  if (!page) return;
  await page.screenshot({ path: path.join(DATA_DIR, 'sync-error.png'), fullPage: true });
  const html = await page.content();
  await fs.promises.writeFile(path.join(DATA_DIR, 'sync-error.html'), html, 'utf8');
}

// Scrape every account (current + savings) and its live balance off the accounts
// list page. Best-effort: any failure yields [] so the CSV import still proceeds.
async function scrapeAccounts(page: import('playwright').Page): Promise<BankAccount[]> {
  try {
    const raw = await page.locator('.accountsModel').evaluateAll((nodes) =>
      nodes.map((n) => ({
        name: n.querySelector('.userName')?.getAttribute('aria-label')?.trim()
          ?? n.querySelector('.userName')?.textContent?.trim() ?? '',
        iban: n.querySelector('.no_wrap')?.textContent?.trim() ?? null,
        type: n.querySelector('.long_account_type')?.textContent?.trim() ?? null,
        amountText: n.querySelector('span[data-rv-text="account.account.balance.amount|currency"]')?.textContent?.trim() ?? null,
        currency: n.querySelector('span[data-rv-text="account.account.balance.currency"]')?.textContent?.trim() ?? null,
      })),
    );
    return raw
      .filter((a) => a.name)
      .map((a) => ({ name: a.name, iban: a.iban, type: a.type, balanceCents: parseBalance(a.amountText), currency: a.currency }));
  } catch {
    return [];
  }
}

// Rolling window: [today − 3 months, today], formatted dd/mm/yyyy for the bank's
// date inputs. The end is *today in Europe/Brussels*, computed explicitly because the
// bank rejects an end date after today in Belgian time, while the production container
// runs in UTC (behind Brussels) — using the raw UTC date would drop today's
// transactions in the early hours. todayBE is derived via Intl (TZ-correct), then the
// 3-month subtraction is plain UTC calendar math so it's independent of the host TZ.
// A day that doesn't exist in the target month shifts by a day or two — harmless for
// a range start; dedup absorbs any overlap.
function last3Months(): { from: string; to: string } {
  const todayBE = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()); // "YYYY-MM-DD"
  const [y, m, d] = todayBE.split('-').map(Number);
  const to = new Date(Date.UTC(y, m - 1, d));
  const from = new Date(to);
  from.setUTCMonth(from.getUTCMonth() - 3);
  const fmt = (dt: Date) => {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(dt.getUTCDate())}/${p(dt.getUTCMonth() + 1)}/${dt.getUTCFullYear()}`;
  };
  return { from: fmt(from), to: fmt(to) };
}
