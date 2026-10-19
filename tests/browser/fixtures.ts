import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { resolve } from 'node:path';

export const test = base.extend<{
  context: BrowserContext;
  toggle: (page: Page) => Promise<void>;
}>({
  context: async ({ playwright }, use) => {
    const extension = resolve('dist');
    const context = await playwright.chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: !process.env.HEADED,
      viewport: { width: 1100, height: 800 },
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
        '--enable-unsafe-extension-debugging',
      ],
    });
    await use(context);
    await context.close();
  },
  toggle: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    await expect.poll(() => worker.evaluate(() => chrome.action.onClicked.hasListeners())).toBe(true);
    const id = new URL(worker.url()).host;
    const browserSession = await context.browser()!.newBrowserCDPSession();
    await use(async (page) => {
      const { targetInfos } = await browserSession.send('Target.getTargets', {
        filter: [{ type: 'tab', exclude: false }],
      });
      const tab = targetInfos.find((target) => target.url === page.url());
      if (!tab) throw new Error('No tab target: ' + JSON.stringify(targetInfos));
      // Invoke the real action so Chrome grants activeTab; no extra host permissions in the test build.
      await browserSession.send('Extensions.triggerAction', { id, targetId: tab.targetId });
    });
    await browserSession.detach();
  },
});

export { expect };

export const overlaySelector = 'contrast-inspector-overlay';
export const tooltipSelector = overlaySelector + ' .tooltip';

export async function point(page: Page, selector: string) {
  const locator = page.locator(selector);
  await locator.scrollIntoViewIfNeeded();
  const rect = await locator.boundingBox();
  if (!rect) throw new Error('Missing fixture: ' + selector);
  await page.mouse.move(rect.x + Math.min(rect.width / 2, 70), rect.y + rect.height / 2);
}
