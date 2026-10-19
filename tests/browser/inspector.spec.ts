import { test, expect, overlaySelector, tooltipSelector, point } from './fixtures';

test.beforeEach(async ({ page }) => { await page.goto('http://127.0.0.1:4173'); });

test('action toggles the built script repeatedly and Escape cleans up', async ({ page, toggle, context }) => {
  const commands = await context.serviceWorkers()[0].evaluate(() => chrome.commands.getAll());
  expect(commands.find((command) => command.name === '_execute_action')?.shortcut).toBeTruthy();
  for (let i = 0; i < 3; i++) {
    await toggle(page);
    await expect(page.locator(overlaySelector)).toHaveCount(1);
    await point(page, '#plain');
    await expect(page.locator(tooltipSelector)).toContainText('21.00:1');
    await toggle(page);
    await expect(page.locator(overlaySelector)).toHaveCount(0);
  }
  await toggle(page);
  await page.keyboard.press('Escape');
  await expect(page.locator(overlaySelector)).toHaveCount(0);
  await page.locator('#pointer-action').click();
  expect(await page.evaluate(() => (window as unknown as { actions: { click: number } }).actions.click)).toBe(1);
});

test('observes native hover and CSS transitions without blocking pointer movement', async ({ page, toggle }) => {
  await toggle(page);
  await point(page, '#hover');
  await expect(page.locator('#hover')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator(tooltipSelector)).toContainText('#000000');
  await expect(page.locator(tooltipSelector)).toContainText('21.00:1');
  await point(page, '#transition');
  await expect(page.locator('#transition')).toHaveCSS('color', 'rgb(0, 0, 0)');
  await expect(page.locator(tooltipSelector)).toContainText('21.00:1');
  await expect(page.locator(tooltipSelector + ' .row').first()).toContainText('#000000');
  await point(page, '#hover-menu');
  await expect(page.locator('#menu')).toBeVisible();
  await point(page, '#menu');
  await expect(page.locator(tooltipSelector)).toHaveAttribute('data-status', 'assessed');
});

test('targets open shadow text, slotted text and display:contents ancestry', async ({ page, toggle }) => {
  await toggle(page);
  for (const selector of ['#shadow #shadow-text', '#slotted', '#nested', '#contents-child']) {
    await point(page, selector);
    await expect(page.locator(tooltipSelector)).toHaveAttribute('data-status', 'assessed');
    if (selector !== '#contents-child') await expect(page.locator(tooltipSelector)).toContainText('9.45:1');
    else await expect(page.locator(tooltipSelector)).toContainText('21.00:1');
    const aligned = await page.locator(selector).evaluate((element) => {
      const target = element.getBoundingClientRect();
      const outline = document.querySelector('contrast-inspector-overlay')!.shadowRoot!.querySelector('.outline')!.getBoundingClientRect();
      return Math.abs(target.left - outline.left) < 1 && Math.abs(target.width - outline.width) < 1;
    });
    expect(aligned).toBe(true);
  }
});

test('pin and unpin consume pointer/mouse sequences and preserve focus and snapshots', async ({ page, toggle }) => {
  await page.locator('#focus').focus();
  await toggle(page);
  await point(page, '#hover');
  const snapshot = await page.locator(tooltipSelector).textContent();
  await page.mouse.click(200, 220);
  await expect(page.locator(overlaySelector)).toHaveAttribute('data-pinned', 'true');
  await point(page, '#pointer-action');
  await expect(page.locator(tooltipSelector)).toContainText(snapshot!);
  await page.mouse.click(750, 310);
  await expect(page.locator(overlaySelector)).toHaveAttribute('data-pinned', 'false');
  for (let i = 0; i < 2; i++) {
    await point(page, '#pointer-action');
    const box = await page.locator('#pointer-action').boundingBox();
    await page.mouse.click(box!.x + 25, box!.y + 20);
  }
  expect(await page.evaluate(() => (window as unknown as { actions: object }).actions)).toEqual({
    pointerdown: 0, mousedown: 0, pointerup: 0, mouseup: 0, click: 0, contextmenu: 0,
  });
  await expect(page.locator('#focus')).toBeFocused();
  await point(page, '#navigate');
  const box = await page.locator('#navigate').boundingBox();
  for (let i = 0; i < 2; i++) await page.mouse.click(box!.x + 30, box!.y + 20);
  expect(new URL(page.url()).hash).toBe('');
  await page.locator('#pointer-action').click({ button: 'right' });
  expect(await page.evaluate(() => (window as unknown as { actions: { contextmenu: number } }).actions.contextmenu)).toBe(1);
});

test('separates no-text and unsupported text without ratio or badges', async ({ page, toggle }) => {
  await toggle(page);
  for (const selector of ['#empty', '#descendant', '#empty-pseudo']) {
    await point(page, selector);
    await expect(page.locator(tooltipSelector)).toContainText('No inspectable text');
    await expect(page.locator(tooltipSelector)).not.toContainText('Contrast');
    await expect(page.locator(tooltipSelector)).not.toContainText('Pass');
  }
  for (const selector of ['#mixed', '#mixed-background', '#generated', '#pseudo', '#svg text', '#canvas', '#overflow']) {
    await point(page, selector);
    await expect(page.locator(tooltipSelector)).toHaveAttribute('data-status', 'indeterminate');
    await expect(page.locator(tooltipSelector)).toContainText('Not assessed');
    await expect(page.locator(tooltipSelector)).not.toContainText('Pass');
  }
  await point(page, '#child');
  await expect(page.locator(tooltipSelector)).toHaveAttribute('data-status', 'assessed');
});

test('resolves alpha, pass/fail, modern colors and opaque shielding', async ({ page, toggle }) => {
  await toggle(page);
  await point(page, '#pass');
  await expect(page.locator(tooltipSelector)).toContainText('9.45:1');
  await expect(page.locator(tooltipSelector)).toContainText('✓ Pass');
  await point(page, '#fail');
  await expect(page.locator(tooltipSelector)).toContainText('✕ Fail');
  await point(page, '#alpha');
  await expect(page.locator(tooltipSelector)).toContainText('#8040BF');
  await expect(page.locator(tooltipSelector)).toContainText('#402060');
  for (const selector of ['#p3', '#lab', '#lch', '#oklab', '#oklch', '#srgb', '#opaque']) {
    await point(page, selector);
    await expect(page.locator(tooltipSelector)).toHaveAttribute('data-status', 'assessed');
  }
  for (const selector of ['#gradient', '#p3-out', '#unsupported', '#opacity-card', '#filter-card',
    '#blend', '#background-blend', '#backdrop-filter', '#clip', '#text-shadow', '#first-letter', '#positioned']) {
    await point(page, selector);
    await expect(page.locator(tooltipSelector)).toHaveAttribute('data-status', 'indeterminate');
    await expect(page.locator(tooltipSelector)).toContainText('Not assessed');
  }
  for (const selector of ['#large', '#bold-large']) {
    await point(page, selector);
    await expect(page.locator(tooltipSelector)).toContainText('AA large');
  }
  await point(page, '#almost-large');
  await expect(page.locator(tooltipSelector)).toContainText('AA normal');
});

for (const [mode, color] of [['dark', '#111111'], ['body', '#111111'], ['alpha', '#808080'], ['unknown', null]]) {
  test(`handles ${mode} root/body canvas propagation`, async ({ page, toggle }) => {
    await page.goto('http://127.0.0.1:4173/?canvas=' + mode);
    await toggle(page);
    await point(page, '#child');
    if (color) {
      await expect(page.locator(tooltipSelector)).toHaveAttribute('data-status', 'assessed');
      await expect(page.locator(tooltipSelector)).toContainText(color);
    } else {
      await expect(page.locator(tooltipSelector)).toContainText('Unknown document canvas');
    }
  });
}

test('iframe boundaries clear unpinned results and preserve pinned snapshots', async ({ page, toggle }) => {
  await toggle(page);
  for (const selector of ['#same-frame', '#cross-frame']) {
    await point(page, '#plain');
    await expect(page.locator(tooltipSelector)).toContainText('21.00:1');
    await point(page, selector);
    await expect(page.locator(tooltipSelector)).toContainText('Frame content not supported');
    await expect(page.locator(tooltipSelector)).not.toContainText('21.00:1');
    expect(await page.frameLocator(selector).locator(overlaySelector).count()).toBe(0);
  }
  await point(page, '#plain');
  await page.mouse.down();
  await page.mouse.up();
  await point(page, '#same-frame');
  await expect(page.locator(tooltipSelector)).toContainText('21.00:1');
  await expect(page.locator(overlaySelector)).toHaveAttribute('data-pinned', 'true');
});

test('keeps overlay above dialogs and popovers before/during inspection, including pinned', async ({ page, toggle }) => {
  await page.locator('#dialog').evaluate((element: HTMLDialogElement) => element.showModal());
  await toggle(page);
  await point(page, '#dialog-text');
  await expect(page.locator(tooltipSelector)).toContainText('21.00:1');
  await page.locator('#dialog').evaluate((element: HTMLDialogElement) => element.close());
  await point(page, '#plain');
  await page.mouse.down();
  await page.mouse.up();
  await page.locator('#dialog').evaluate((element: HTMLDialogElement) => element.showModal());
  await page.locator('#page-popover').evaluate((element: HTMLElement) => element.showPopover());
  await page.locator('#dialog').evaluate((element: HTMLDialogElement) => { element.close(); element.showModal(); });
  await expect(page.locator('#dialog')).toBeVisible();
  await expect(page.locator('#page-popover')).toBeVisible();
  await expect(page.locator(tooltipSelector)).toContainText('Pinned snapshot');
  await expect.poll(async () => page.evaluate(() => {
    const host = document.querySelector('contrast-inspector-overlay')!;
    const tooltip = host.shadowRoot!.querySelector('.tooltip')!;
    const rect = tooltip.getBoundingClientRect();
    // Pointer transparency plus browser hit testing proves the page stays reachable.
    return { popover: host.matches(':popover-open'), pointer: getComputedStyle(host).pointerEvents,
      overPage: document.elementFromPoint(rect.x + 3, rect.y + 3) !== host };
  })).toEqual({ popover: true, pointer: 'none', overPage: true });
  await page.screenshot({ path: 'test-results/top-layer.png' });
});

test('updates shadow mutations and handles removal and popovers inside shadow roots', async ({ page, toggle }) => {
  await toggle(page);
  await point(page, '#shadow #shadow-text');
  await expect(page.locator(tooltipSelector)).toContainText('9.45:1');
  await page.locator('#shadow #shadow-text').evaluate((element: HTMLElement) => { element.style.color = 'black'; });
  await expect(page.locator(tooltipSelector + ' .row').first()).toContainText('#000000');
  await page.mouse.down();
  await page.mouse.up();
  await page.locator('#shadow').evaluate((element) => {
    const popover = document.createElement('div');
    popover.setAttribute('popover', 'manual');
    popover.textContent = 'Shadow popover';
    element.shadowRoot!.append(popover);
    popover.showPopover();
  });
  await expect(page.locator('#shadow [popover]')).toBeVisible();
  await expect(page.locator(overlaySelector)).toHaveAttribute('data-pinned', 'true');
  await page.locator('#shadow #shadow-text').evaluate((element) => element.remove());
  await expect(page.locator(tooltipSelector)).toContainText('Element no longer available');
});

test('positions in viewport corners and follows pinned scrolling, resize and removal', async ({ page, toggle }) => {
  await toggle(page);
  await point(page, '#bottom');
  await expect(page.locator(tooltipSelector)).toHaveAttribute('data-status', 'assessed');
  await page.mouse.down();
  await page.mouse.up();
  await page.mouse.wheel(0, -100);
  await expect.poll(() => page.locator('#bottom').evaluate((element) => {
    const outline = document.querySelector('contrast-inspector-overlay')!.shadowRoot!.querySelector('.outline')!;
    return Math.abs(element.getBoundingClientRect().top - outline.getBoundingClientRect().top);
  })).toBeLessThan(1);
  await page.setViewportSize({ width: 320, height: 480 });
  await expect.poll(() => page.locator(tooltipSelector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
  })).toBe(true);
  await page.locator('#bottom').evaluate((element) => element.remove());
  await expect(page.locator(tooltipSelector)).toContainText('Element no longer available');
  await page.keyboard.press('Escape');
  await expect(page.locator(overlaySelector)).toHaveCount(0);
});

test('restricted pages fail gracefully', async ({ page, context, toggle }) => {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const errors: string[] = [];
  worker.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('chrome://version');
  await toggle(page);
  await expect.poll(() => worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return chrome.action.getTitle({ tabId: tab.id });
  })).toContain('unavailable');
  expect(errors).toEqual([]);
  await expect(page.locator(overlaySelector)).toHaveCount(0);
});
