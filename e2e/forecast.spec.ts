import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.evaluate(() => localStorage.setItem('acme-authed', '1'));
});

test('lists the revenue streams', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('cell', { name: 'Wholesale' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Retail' })).toBeVisible();
});

test('adds a revenue stream from the dialog', async ({ page }) => {
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Add revenue stream' }).click();
  await page.getByLabel('Name').fill('Consulting');
  await page.getByLabel('Per month').fill('4000');
  await page.getByLabel('Billable hours').check();
  await page.getByRole('button', { name: 'Add stream' }).click();
  await expect(page.getByRole('cell', { name: 'Consulting' })).toBeVisible();
});
