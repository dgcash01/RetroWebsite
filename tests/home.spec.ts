import { test, expect } from '@playwright/test';

test.describe('Home Page', () => {
  const viewports = [
    { name: 'Mobile', width: 360, height: 740 },
    { name: 'Tablet', width: 768, height: 1024 },
    { name: 'Desktop', width: 1280, height: 800 },
  ];

  for (const { name, width, height } of viewports) {
    test(`Responsive layout and no console errors on ${name}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });

      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      await page.goto('/');

      // 1. Assert no console errors
      expect(consoleErrors).toEqual([]);

      // 2. Assert no horizontal scrollbar
      const scrollWidth = await page.evaluate(
        () => document.documentElement.scrollWidth,
      );
      const clientWidth = await page.evaluate(
        () => document.documentElement.clientWidth,
      );
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });
  }
});
