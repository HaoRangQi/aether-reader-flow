import { test, expect } from '@playwright/test';

test('library renders empty-state on a fresh profile', async ({ page }) => {
  await page.goto('/');
  const emptyState = page.getByText('书架还是空的').locator('..');
  await expect(emptyState).toBeVisible();
  await expect(emptyState.getByRole('button', { name: '上传书籍' })).toBeVisible();
});

test('settings page renders primary sections', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: '设置' }).click();

  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
  await expect(page.getByRole('button', { name: '模型服务' })).toBeVisible();
  await expect(page.getByRole('button', { name: '任务路由' })).toBeVisible();
  await expect(page.getByRole('button', { name: '存储状态' })).toBeVisible();
});

test('manifest is available for installability checks', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);

  const manifest = await response.json();
  expect(manifest).toMatchObject({
    name: 'Aether Reader Flow',
    short_name: 'Aether',
    start_url: '/',
    display: 'standalone',
  });
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ src: '/aether-icon.svg' }),
      expect.objectContaining({ src: '/aether-maskable.svg', purpose: 'maskable' }),
    ]),
  );
});
