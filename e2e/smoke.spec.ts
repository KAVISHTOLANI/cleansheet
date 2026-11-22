import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { checkMobile, snap } from './helpers';

test('review, choose fixes, preview and download a cleaned CSV', async ({ page }) => {
  await page.goto('./');
  await page.waitForTimeout(1000);
  await snap(page, 'landing');
  await checkMobile(page, 'landing-mobile');
  await page.getByRole('link', { name: 'Clean a CSV' }).first().click();
  await expect(page.getByText(/→ 16 rows/)).toBeVisible();
  await page.getByLabel('Blank out NA, null, none and “-”').check();
  await page.getByLabel('Letter case for city').selectOption('title');
  await expect(page.getByRole('tab', { name: /Changed cells/ })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await snap(page, 'clean');
  await checkMobile(page);

  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download demo-customers-clean.csv/ }).click();
  const file = await dl;
  const text = readFileSync(await file.path(), 'utf8');
  expect(text).toContain('102,Grace Hopper,grace@example.com,New York,Free,2026-01-06');
  expect(text).toContain('Manchester');
  expect(text.match(/Grace Hopper/g)).toHaveLength(1);
  expect(text).not.toContain(',NA,');
  await expect(page.getByText(/Your original file is unchanged/)).toBeVisible();
});
