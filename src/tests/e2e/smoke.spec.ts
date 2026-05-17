import { test, expect } from '@playwright/test';

/**
 * Smoke tests that verify pages render. We DO NOT test the full upload
 * flow here — that requires a real PDF fixture and a headed browser to
 * exercise IndexedDB. P5 adds those.
 */

test('library renders empty-state on a fresh profile', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('书架还是空的')).toBeVisible();
});

test('settings page can be navigated to once it exists', async () => {
  // Placeholder for P4 — left here so the suite has a known location to
  // expand to as settings ships.
  test.skip(true, 'Settings page lands in P4');
});
