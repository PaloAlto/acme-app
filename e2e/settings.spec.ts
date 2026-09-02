import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.evaluate(() => localStorage.setItem('acme-authed', '1'));
});

test('shows the notification switches', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByLabel('Email me a weekly summary')).toBeChecked();
  await expect(page.getByLabel('Show sample data')).not.toBeChecked();
});

test('offers a currency', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByLabel('Currency')).toHaveValue('USD');
  await page.getByLabel('Currency').selectOption('EUR');
  await expect(page.getByLabel('Currency')).toHaveValue('EUR');
});
