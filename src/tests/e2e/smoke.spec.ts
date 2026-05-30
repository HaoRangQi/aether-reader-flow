import { test, expect } from '@playwright/test';

async function uploadTxtBook(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '上传书籍' }).first().click();
  await page
    .locator('input[type="file"]')
    .setInputFiles({
      name: 'money-flow.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(
        [
          '第一章 流动性',
          '',
          'M2 增速变化会影响市场预期。央行扩表并不必然推高房地产价格。',
          '',
          '读者需要结合信用传导、资产供给和监管环境判断。',
        ].join('\n'),
        'utf8',
      ),
    });

  await expect(page.getByRole('link', { name: /money-flow/ })).toBeVisible();
}

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

test('uploads TXT, reads, translates a selection, records timeline, and opens export dialog', async ({ page }) => {
  await page.route('**/api/ai/translate', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson; charset=utf-8',
      body: [
        JSON.stringify({ type: 'text', text: 'M2 growth changes market expectations.' }),
        JSON.stringify({ type: 'usage', inputTokens: 12, outputTokens: 7 }),
      ].join('\n') + '\n',
    });
  });

  await page.goto('/');
  await uploadTxtBook(page);
  await page.getByRole('link', { name: /money-flow/ }).click();

  await expect(page).toHaveURL(/\/reader\/book-/);
  await expect(page.getByRole('heading', { name: '全文' })).toBeVisible();
  await expect(page.getByText('M2 增速变化会影响市场预期')).toBeVisible();

  await page.getByRole('button', { name: '解锁 AI' }).click();
  await page.getByLabel('主密码').fill('test-master');
  await page.getByLabel('Anthropic API Key').fill('sk-ant-test-value-123456');
  await page.getByRole('button', { name: '保存并解锁' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  const selectionText = page.getByText('M2 增速变化会影响市场预期');
  await selectionText.evaluate(node => {
    const textNode = node.firstChild;
    if (!textNode) throw new Error('missing text node');
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 16);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
  });

  await page.getByRole('button', { name: '翻译' }).click();
  await expect(page.getByText('M2 growth changes market expectations.')).toBeVisible();

  await page.getByRole('button', { name: '关闭' }).click();
  await page.getByRole('button', { name: '时间轴' }).click();
  await expect(page.getByLabel(/时间轴结果，共 1 个条目/)).toBeVisible();
  await expect(page.getByText('M2 growth changes market expectations.')).toBeVisible();
  await expect(page.getByText('claude-haiku-4-5 · 19 tokens')).toBeVisible();

  await page.getByRole('link', { name: '← 返回书架' }).click();
  await page.getByRole('button', { name: '导出', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '导出思考文档' })).toBeVisible();
  await expect(page.getByText('将以「完整阅读报告」模板导出 1 个章节为 Markdown。')).toBeVisible();
});
