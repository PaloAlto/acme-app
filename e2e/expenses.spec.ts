import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.evaluate(() => localStorage.setItem('acme-authed', '1'));
});

test('lists the expenses with a total', async ({ page }) => {
  await page.goto('/expenses');
  await expect(page.getByRole('cell', { name: 'Office lease' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Payroll' })).toBeVisible();
  await expect(page.locator('#total')).toHaveText('$21,690');
});

test('adds an expense from the dialog', async ({ page }) => {
  await page.goto('/expenses');
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.getByLabel('Name').fill('Travel');
  await page.getByLabel('Per month').fill('1200');
  await page.getByLabel('Category').selectOption('other');
  await page.getByRole('dialog').getByRole('button', { name: 'Add expense' }).click();
  await expect(page.getByRole('cell', { name: 'Travel' })).toBeVisible();
  await expect(page.locator('#total')).toHaveText('$22,890');
});

test('removes an expense', async ({ page }) => {
  await page.goto('/expenses');
  await page
    .getByRole('row', { name: /Accounting software/ })
    .getByRole('button', { name: 'Remove' })
    .click();
  await expect(page.getByRole('cell', { name: 'Accounting software' })).toHaveCount(0);
});
