import { test as base, expect, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { resolve } from 'node:path';

// Playwright applies the config's context options (viewport, baseURL) to this persistent context too.
export const test = base.extend<{
    context: BrowserContext;
    worker: Worker;
    toggle: (page: Page) => Promise<void>;
}>({
    context: async ({ playwright }, use) => {
        const extension = resolve('dist');
        const context = await playwright.chromium.launchPersistentContext('', {
            channel: 'chromium',
            headless: !process.env.HEADED,
            args: [
                `--disable-extensions-except=${extension}`,
                `--load-extension=${extension}`,
                '--enable-unsafe-extension-debugging',
            ],
        });
        await use(context);
        await context.close();
    },
    worker: async ({ context }, use) => {
        const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
        await expect.poll(() => worker.evaluate(() => chrome.action.onClicked.hasListeners())).toBe(true);
        await use(worker);
    },
    toggle: async ({ context, worker }, use) => {
        const id = new URL(worker.url()).host;
        const browserSession = await context.browser()!.newBrowserCDPSession();
        await use(async (page) => {
            const { targetInfos } = await browserSession.send('Target.getTargets', {
                filter: [{ type: 'tab', exclude: false }],
            });
            const tab = targetInfos.find((target) => target.url === page.url());
            if (!tab) throw new Error('No tab target: ' + JSON.stringify(targetInfos));
            // Invoke the real action so Chrome grants activeTab; no extra host permissions in the test build.
            await browserSession.send('Extensions.triggerAction', {
                id,
                targetId: tab.targetId,
            });
        });
        await browserSession.detach();
    },
});

export { expect };

export const overlaySelector = 'contrast-inspector-overlay';
export const tooltipSelector = overlaySelector + ' .tooltip';

// A nonzero offset nudges the pointer within the same element, which makes the inspector pick up page changes.
export async function point(page: Page, selector: string, offset = 0) {
    const locator = page.locator(selector);
    await locator.scrollIntoViewIfNeeded();
    const rect = await locator.boundingBox();
    if (!rect) throw new Error('Missing fixture: ' + selector);
    await page.mouse.move(rect.x + Math.min(rect.width / 2, 70) + offset, rect.y + rect.height / 2);
}

// Event counts recorded by the fixture page's #pointer-action button.
export function actionCounts(page: Page) {
    return page.evaluate(() => (window as unknown as { actions: Record<string, number> }).actions);
}
