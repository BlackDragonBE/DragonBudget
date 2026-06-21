import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright';

// Live, user-facing step of an in-progress sync.
export type SyncStep = 'launching' | 'waiting_itsme' | 'downloading';
export type OnStatus = (step: SyncStep) => void;

export interface BankCreds {
  gsm: string;          // GSM number used for itsme login
  client: string;       // Klantnummer (client number)
  accountLabel: string; // the account link text to open, e.g. "VAN DE KERCKHOVE E"
}

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
// Persisted Chromium profile so itsme "trust this device" + cookie consent
// survive restarts (lives under the /data volume mount in Docker).
const PROFILE_DIR = path.join(DATA_DIR, 'playwright-profile');

const LOGON_URL = 'https://www.bnpparibasfortis.be/nl/generic/logon';
const ACCOUNTS_URL = 'https://www.bnpparibasfortis.be/nl/secured/accounts/my-accounts-list#target.ia.home.showHome';

/**
 * Log into Easy Banking Web (user confirms via itsme on their phone), export the
 * current year's transactions for the chosen account as CSV, and return its text.
 *
 * Throws on any failure — the caller turns that into an `error` job status so a
 * UI change at the bank surfaces loudly instead of silently importing nothing.
 *
 * Steps derived from a `playwright codegen` recording; selectors are role/label
 * based where possible. The CSV-options modal step uses a positional selector and
 * is the most likely thing to break if BNPPF changes the export dialog.
 */
export async function runSync(creds: BankCreds, onStatus: OnStatus): Promise<string> {
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
    await page.goto(LOGON_URL, { waitUntil: 'commit', timeout: 60_000 });
    // Cookie banner only appears on a fresh profile — ignore if absent.
    await page.getByRole('button', { name: 'Alle cookies aanvaarden' })
      .click({ timeout: 5_000 }).catch(() => {});
    await page.getByRole('textbox', { name: 'Vul uw gsm-nummer in' }).fill(creds.gsm);
    await page.getByRole('textbox', { name: 'Klantnummer' }).fill(creds.client);
    await page.getByRole('button', { name: 'Aanmelden met itsme' }).click();

    // Push is now on the user's phone — wait (generously) for the redirect into
    // the secured area after they confirm.
    onStatus('waiting_itsme');
    await page.waitForURL('**/secured/**', { timeout: 180_000 });

    // --- Navigate to the account and export the current year as CSV ---
    onStatus('downloading');
    await page.goto(ACCOUNTS_URL, { waitUntil: 'commit', timeout: 60_000 });
    await page.getByRole('link', { name: creds.accountLabel, exact: true }).click();
    await page.getByRole('link', { name: 'Zoeken Zoek en exporteer' }).click();
    await page.getByRole('textbox', { name: 'Zoek op bedrag, datum, naam,' }).click();
    await page.getByRole('link', { name: 'In het jaar' }).click();
    // ponytail: exports the current calendar year; in early January last December
    // isn't covered until the next sync / a manual CSV upload. Dedup makes the
    // overlap on every other sync harmless.
    await page.getByRole('textbox', { name: 'jjjj' }).fill(String(new Date().getFullYear()));
    await page.locator('.fontcon-search').click();
    await page.getByRole('link', { name: 'CSV' }).click();
    // CSV-options modal — positional selector from the recording (fragile).
    await page.locator('.modal-body > div:nth-child(3)').click();

    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await page.getByRole('button', { name: 'Bevestigen' }).click();
    const download = await downloadPromise;

    const downloadPath = await download.path();
    // Match the manual-upload path, which reads the CSV as UTF-8.
    return await fs.promises.readFile(downloadPath, 'utf8');
  } finally {
    await ctx.close();
  }
}
