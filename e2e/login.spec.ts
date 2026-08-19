import { expect, test } from '@playwright/test';

test('signs in with an email and a password', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('demo@acme.example');
  await page.getByLabel('Password').fill('demo-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});

test('says which field is wrong', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Password').fill('abc');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText('Enter the email address on your account.')).toBeVisible();
  await page.getByLabel('Email').fill('demo@acme.example');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText('Your password is at least four characters.')).toBeVisible();
});
