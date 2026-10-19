import {
    test,
    expect,
    overlaySelector,
    tooltipSelector,
    point,
    actionCounts,
} from './fixtures';

test.beforeEach(async ({ page }) => {
    await page.goto('/');
});

test('action toggles the built script repeatedly and Escape cleans up', async ({
    page,
    toggle,
    worker,
}) => {
    const commands = await worker.evaluate(() => chrome.commands.getAll());
    expect(
        commands.find((command) => command.name === '_execute_action')
            ?.shortcut,
    ).toBeTruthy();
    for (let i = 0; i < 3; i++) {
        await toggle(page);
        await expect(page.locator(overlaySelector)).toHaveCount(1);
        await expect(page.locator(tooltipSelector)).toBeHidden();
        await point(page, '#plain', i);
        await expect(page.locator(tooltipSelector)).toContainText('21.00:1');
        await toggle(page);
        await expect(page.locator(overlaySelector)).toHaveCount(0);
    }
    await toggle(page);
    await page.keyboard.press('Escape');
    await expect(page.locator(overlaySelector)).toHaveCount(0);
    await page.locator('#pointer-action').click();
    expect((await actionCounts(page)).click).toBe(1);
});

test('blocks native hover unless Shift is held and waits for transitions on the same target', async ({
    page,
    toggle,
}) => {
    await toggle(page);
    for (const selector of ['#hover', '#transition']) {
        await point(page, selector);
        await expect(page.locator(selector)).toHaveCSS(
            'background-color',
            'rgb(0, 0, 0)',
        );
        await expect(
            page.locator(tooltipSelector + ' .row').first(),
        ).toContainText('#FFFFFF');
        await expect(page.locator(tooltipSelector)).toContainText('21.00:1');
        await page.keyboard.down('Shift');
        await point(page, selector, 1);
        await expect(page.locator(selector)).toHaveCSS(
            'background-color',
            'rgb(255, 255, 255)',
        );
        await expect(
            page.locator(tooltipSelector + ' .row').first(),
        ).toContainText('#000000');
        await expect(page.locator(tooltipSelector)).toContainText('21.00:1');
        await page.keyboard.up('Shift');
        await point(page, selector, 2);
        await expect(page.locator(selector)).toHaveCSS(
            'background-color',
            'rgb(0, 0, 0)',
        );
        await expect(
            page.locator(tooltipSelector + ' .row').first(),
        ).toContainText('#FFFFFF');
        await expect(page.locator(tooltipSelector)).toContainText('21.00:1');
    }
    await point(page, '#hover-menu');
    await expect(page.locator('#menu')).toBeHidden();
    await page.keyboard.down('Shift');
    await point(page, '#hover-menu', 1);
    await expect(page.locator('#menu')).toBeVisible();
    await point(page, '#menu');
    await expect(page.locator(tooltipSelector)).toHaveAttribute(
        'data-status',
        'assessed',
    );
    await expect(
        page.locator(tooltipSelector + ' .element-label'),
    ).toContainText('#menu');
    await page.keyboard.up('Shift');
    await point(page, '#hover-menu', 2);
    await expect(page.locator('#menu')).toBeHidden();
});

test('targets open shadow text, slotted text and display:contents ancestry', async ({
    page,
    toggle,
}) => {
    await toggle(page);
    for (const selector of [
        '#shadow #shadow-text',
        '#slotted',
        '#slotted-text',
        '#nested',
        '#contents-child',
    ]) {
        await point(page, selector);
        await expect(page.locator(tooltipSelector)).toHaveAttribute(
            'data-status',
            'assessed',
        );
        if (selector !== '#contents-child')
            await expect(page.locator(tooltipSelector)).toContainText('9.45:1');
        else
            await expect(page.locator(tooltipSelector)).toContainText(
                '21.00:1',
            );
        const aligned = await page.locator(selector).evaluate((element) => {
            const target = element.getBoundingClientRect();
            const outline = document
                .querySelector('contrast-inspector-overlay')!
                .shadowRoot!.querySelector('.outline')!
                .getBoundingClientRect();
            return (
                Math.abs(target.left - outline.left) < 1 &&
                Math.abs(target.width - outline.width) < 1
            );
        });
        expect(aligned).toBe(true);
    }
});

test('blocks pointer and mouse actions unless Shift is held', async ({
    page,
    toggle,
}) => {
    await toggle(page);
    await page.locator('#pointer-action').click({ force: true });
    expect(await actionCounts(page)).toEqual({
        pointerdown: 0,
        mousedown: 0,
        pointerup: 0,
        mouseup: 0,
        click: 0,
        contextmenu: 0,
    });
    await page.keyboard.down('Shift');
    await page.locator('#pointer-action').click();
    expect(await actionCounts(page)).toEqual({
        pointerdown: 1,
        mousedown: 1,
        pointerup: 1,
        mouseup: 1,
        click: 1,
        contextmenu: 0,
    });
    await page.keyboard.up('Shift');
});

test('resolves slotted button labels from both padding and text', async ({
    page,
    toggle,
}) => {
    await toggle(page);
    const button = page.locator('#slotted-text button');
    const rect = (await button.boundingBox())!;
    for (const x of [
        rect.x + 2,
        rect.x + rect.width / 2,
        rect.x + rect.width - 2,
    ]) {
        await page.mouse.move(x, rect.y + rect.height / 2);
        await expect(page.locator(tooltipSelector)).toContainText('9.45:1');
        await expect(
            page.locator(tooltipSelector + ' .element-label'),
        ).toContainText('button-sample#slotted-text');
    }
});

test('resolves one visible text owner through wrappers, shadow roots and slots', async ({
    page,
    toggle,
}) => {
    await page.locator('#descendant').evaluate((element) => {
        element.innerHTML = `
            <span hidden>Hidden text</span>
            <span style="visibility:hidden">Invisible text</span>
            <label-sample><span slot="label" id="resolved-label" style="color:#333">Nested label</span>Unassigned text</label-sample>`;
        const host = element.querySelector('label-sample')!;
        host.attachShadow({ mode: 'open' }).innerHTML =
            '<inner-label></inner-label>';
        host
            .shadowRoot!.querySelector('inner-label')!
            .attachShadow({ mode: 'open' }).innerHTML =
            '<div style="background:#bce8dc"><slot name="label"><span>Unused fallback</span></slot></div>';
        // Forward the outer slot through the nested component.
        const slot = document.createElement('slot');
        slot.name = 'label';
        slot.slot = 'label';
        host.shadowRoot!.querySelector('inner-label')!.append(slot);
    });
    await toggle(page);
    await page.locator('#descendant').hover({
        position: { x: 2, y: 2 },
        force: true,
    });
    await expect(page.locator(tooltipSelector)).toContainText('9.45:1');
    await expect(
        page.locator(tooltipSelector + ' .element-label'),
    ).toContainText('#resolved-label');
});

test('keeps containers with multiple text owners unselected', async ({
    page,
    toggle,
}) => {
    await page.locator('#descendant').evaluate((element) => {
        element.innerHTML =
            '<span id="first-label">First label</span><span style="color:red">Second label</span>';
    });
    await toggle(page);
    await page.locator('#descendant').hover({
        position: { x: 2, y: 2 },
        force: true,
    });
    await expect(page.locator(tooltipSelector)).toContainText(
        'No inspectable text',
    );
    await point(page, '#first-label');
    await expect(page.locator(tooltipSelector)).toContainText('21.00:1');
});

test('separates no-text and unsupported text without ratio or badges', async ({
    page,
    toggle,
}) => {
    await toggle(page);
    for (const selector of ['#empty', '#icon']) {
        await point(page, selector);
        await expect(page.locator(tooltipSelector)).toContainText(
            'No inspectable text',
        );
        await expect(page.locator(tooltipSelector)).not.toContainText(
            'Contrast',
        );
        await expect(page.locator(tooltipSelector)).not.toContainText('Pass');
    }
    for (const selector of ['#svg text', '#canvas', '#overflow']) {
        await point(page, selector);
        await expect(page.locator(tooltipSelector)).toHaveAttribute(
            'data-status',
            'indeterminate',
        );
        await expect(page.locator(tooltipSelector)).toContainText(
            'Not assessed',
        );
        await expect(page.locator(tooltipSelector)).not.toContainText('Pass');
    }
    for (const selector of ['#child', '#descendant', '#mixed']) {
        await point(page, selector);
        await expect(page.locator(tooltipSelector)).toHaveAttribute(
            'data-status',
            'assessed',
        );
    }
});

test('resolves alpha, pass/fail, modern colors and opaque shielding', async ({
    page,
    toggle,
}) => {
    await toggle(page);
    await point(page, '#pass');
    await expect(page.locator(tooltipSelector)).toContainText('9.45:1');
    await expect(page.locator(tooltipSelector)).toContainText('✓ Pass');
    await point(page, '#fail');
    await expect(page.locator(tooltipSelector)).toContainText('✕ Fail');
    await point(page, '#alpha');
    await expect(page.locator(tooltipSelector)).toContainText('#8040BF');
    await expect(page.locator(tooltipSelector)).toContainText('#402060');
    for (const selector of [
        '#p3',
        '#lab',
        '#lch',
        '#oklab',
        '#oklch',
        '#srgb',
        '#p3-out',
        '#rec2020',
        '#opaque',
        '#background-blend',
        '#pseudo',
    ]) {
        await point(page, selector);
        await expect(page.locator(tooltipSelector)).toHaveAttribute(
            'data-status',
            'assessed',
        );
    }
    for (const selector of [
        '#gradient',
        '#opacity-card',
        '#filter-card',
        '#blend',
        '#backdrop-filter',
        '#positioned',
    ]) {
        await point(page, selector);
        await expect(page.locator(tooltipSelector)).toHaveAttribute(
            'data-status',
            'indeterminate',
        );
        await expect(page.locator(tooltipSelector)).toContainText(
            'Not assessed',
        );
    }
    for (const selector of ['#large', '#bold-large']) {
        await point(page, selector);
        await expect(page.locator(tooltipSelector)).toContainText('AA large');
    }
    await point(page, '#almost-large');
    await expect(page.locator(tooltipSelector)).toContainText('AA normal');
    await point(page, '#text-fill');
    await expect(page.locator(tooltipSelector + ' .row').first()).toContainText(
        '#FF0000',
    );
});

for (const [mode, color] of [
    ['dark', '#111111'],
    ['body', '#111111'],
    ['alpha', '#808080'],
    ['translucent', '#FFFFFF'],
]) {
    test(`handles ${mode} root/body canvas propagation`, async ({
        page,
        toggle,
    }) => {
        await page.goto('/?canvas=' + mode);
        await toggle(page);
        await point(page, '#child');
        await expect(page.locator(tooltipSelector)).toHaveAttribute(
            'data-status',
            'assessed',
        );
        await expect(page.locator(tooltipSelector)).toContainText(color);
    });
}

test('cross-origin iframe boundaries clear results', async ({
    page,
    toggle,
}) => {
    await toggle(page);
    await point(page, '#plain');
    await expect(page.locator(tooltipSelector)).toContainText('21.00:1');
    await point(page, '#cross-frame');
    await expect(page.locator(tooltipSelector)).toContainText(
        'No inspectable text',
    );
    await expect(page.locator(tooltipSelector)).not.toContainText('21.00:1');
    await expect(
        page.frameLocator('#cross-frame').locator(overlaySelector),
    ).toHaveCount(0);
});

test('inspects same-origin frame text, shadow roots and native hover with one top-level overlay', async ({
    page,
    toggle,
}) => {
    await toggle(page);
    const preview = page.frameLocator('#same-frame');
    for (const selector of ['#frame-text', '#frame-shadow', '#frame-action']) {
        await preview.locator(selector).hover({ force: true });
        await expect(page.locator(tooltipSelector)).toContainText(
            selector === '#frame-action' ? '7.46:1' : '21.00:1',
        );
        await expect(
            page.locator(tooltipSelector + ' .element-label'),
        ).toContainText(selector);
    }
    await preview.locator('svg text').hover({ force: true });
    await expect(page.locator(tooltipSelector)).toContainText(
        'SVG or canvas text',
    );
    await expect(preview.locator(overlaySelector)).toHaveCount(0);
    await preview.locator('#frame-text').evaluate((element: HTMLElement) => {
        element.ownerDocument.documentElement.style.background = '#111';
        element.style.color = 'white';
    });
    await preview.locator('#frame-text').hover({ force: true });
    await expect(page.locator(tooltipSelector)).toContainText('#111111');
    await preview.locator('#frame-text').evaluate((element: HTMLElement) => {
        element.ownerDocument.documentElement.style.background = 'white';
        element.style.color = 'black';
    });
    await preview.locator('#frame-text').hover({ force: true });
    await expect(page.locator(tooltipSelector)).toContainText('21.00:1');
    await preview.locator('#frame-action').click({ force: true });
    await expect(page.locator(tooltipSelector)).toContainText('7.46:1');
    await page.keyboard.down('Shift');
    await preview.locator('#frame-action').hover({ force: true });
    await expect(page.locator(tooltipSelector)).toContainText('21.00:1');
    await page.keyboard.up('Shift');
    expect(
        await preview
            .locator('body')
            .evaluate(() => (window as unknown as { actions: number }).actions),
    ).toBe(0);
    await preview.locator('#frame-action').focus();
    await page.keyboard.press('Escape');
    await expect(page.locator(overlaySelector)).toHaveCount(0);
    await preview.locator('#frame-action').click();
    expect(
        await preview
            .locator('body')
            .evaluate(() => (window as unknown as { actions: number }).actions),
    ).toBe(5);
});

test('aligns nested frame targets with borders, padding, zoom and scrolling', async ({
    page,
    toggle,
}) => {
    await page.locator('#same-frame').evaluate((element: HTMLIFrameElement) => {
        element.style.cssText =
            'height: 250px; width: 400px; border: 6px solid; padding: 5px; transform: scale(0.75); transform-origin: top left';
        const nested = element.contentDocument!.createElement('iframe');
        nested.src = '/frame.html';
        nested.addEventListener('load', () => {
            nested.contentDocument!.querySelector<HTMLElement>(
                '#frame-text',
            )!.style.height = '60px';
        });
        nested.style.cssText = 'height: 130px; width: 250px; border: 4px solid';
        element.contentDocument!.body.append(nested);
    });
    const target = page
        .frameLocator('#same-frame')
        .frameLocator('iframe')
        .locator('#frame-text');
    await expect(target).toBeVisible();
    await toggle(page);
    await target.hover({ force: true });
    await expect(page.locator(tooltipSelector)).toContainText('21.00:1');
    await page
        .locator('#same-frame')
        .evaluate((element: HTMLIFrameElement) =>
            element.contentWindow!.scrollBy(0, 12),
        );
    const box = await target.boundingBox();
    await expect
        .poll(() => page.locator(overlaySelector + ' .outline').boundingBox())
        .toEqual(box);
    await toggle(page);
    await page.locator('#same-frame').evaluate((element: HTMLIFrameElement) => {
        element.style.transform = 'rotate(10deg)';
    });
    await toggle(page);
    await target.hover({ force: true });
    await expect(page.locator(tooltipSelector)).toContainText(
        'No inspectable text',
    );
    await expect(
        page.locator(tooltipSelector + ' .element-label'),
    ).toContainText('#same-frame');
});

test('aligns targets in frames with fractional sizes', async ({
    page,
    toggle,
}) => {
    await page.locator('#same-frame').evaluate((element: HTMLIFrameElement) => {
        element.style.cssText =
            'width: 400.5px; height: 150.5px; border: 1px solid; padding: 2.5px';
        element.contentDocument!.querySelector<HTMLElement>(
            '#frame-text',
        )!.style.marginLeft = '300px';
    });
    const target = page.frameLocator('#same-frame').locator('#frame-text');
    await toggle(page);
    await target.hover({ force: true });
    await expect(page.locator(tooltipSelector)).toContainText('21.00:1');
    expect(
        await page.locator(overlaySelector + ' .outline').boundingBox(),
    ).toEqual(await target.boundingBox());
});

test('picks up frames added and reloaded during inspection and cleans up on toggles', async ({
    page,
    toggle,
}) => {
    await toggle(page);
    await page.evaluate(() => {
        const frame = document.createElement('iframe');
        frame.id = 'new-frame';
        frame.src = '/frame.html';
        document.querySelector('#same-frame')!.after(frame);
    });
    const preview = page.frameLocator('#new-frame');
    await preview.locator('#frame-text').hover({ force: true });
    await expect(page.locator(tooltipSelector)).toContainText('21.00:1');
    await page.locator('#new-frame').evaluate((element: HTMLIFrameElement) => {
        element.src = '/frame.html?reload';
    });
    await preview.locator('#frame-text').hover({ force: true });
    await expect(page.locator(tooltipSelector)).toContainText('21.00:1');
    await toggle(page);
    await expect(page.locator(overlaySelector)).toHaveCount(0);
    await toggle(page);
    await preview.locator('#frame-action').hover({ force: true });
    await expect(page.locator(tooltipSelector)).toContainText('#frame-action');
    await preview.locator('#frame-action').click({ force: true });
    expect(
        await preview
            .locator('body')
            .evaluate(() => (window as unknown as { actions: number }).actions),
    ).toBe(0);
});

test('forwards wheel scrolling to inner containers and frame viewports', async ({
    page,
    toggle,
}) => {
    await page.locator('#plain').evaluate((element: HTMLElement) => {
        element.style.cssText = 'overflow: auto; height: 80px';
        element.innerHTML = '<div style="height: 500px">Scrollable text</div>';
    });
    const preview = page.frameLocator('#same-frame');
    await preview.locator('body').evaluate((element) => {
        element.style.height = '500px';
    });
    await toggle(page);
    await point(page, '#plain');
    let pageScroll = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, 50);
    await expect
        .poll(() =>
            page.locator('#plain').evaluate((element) => element.scrollTop),
        )
        .toBe(50);
    expect(await page.evaluate(() => scrollY)).toBe(pageScroll);
    await preview.locator('#frame-text').hover({ force: true });
    pageScroll = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, 40);
    await expect
        .poll(() => preview.locator('body').evaluate(() => scrollY))
        .toBe(40);
    expect(await page.evaluate(() => scrollY)).toBe(pageScroll);
});

test('declines transparent frame canvases and embedding group effects', async ({
    page,
    toggle,
}) => {
    await toggle(page);
    const target = page.frameLocator('#same-frame').locator('#frame-text');
    await page.locator('#same-frame').evaluate((element: HTMLIFrameElement) => {
        element.contentDocument!.documentElement.style.background =
            'transparent';
    });
    await target.hover({ force: true });
    await expect(page.locator(tooltipSelector)).toContainText(
        'Transparent iframe background',
    );
    for (const style of [
        'opacity: 0.5',
        'filter: brightness(0.5)',
        'mix-blend-mode: multiply',
    ]) {
        await page
            .locator('#same-frame')
            .evaluate((element: HTMLIFrameElement, style) => {
                element.contentDocument!.documentElement.style.background =
                    'white';
                element.style.cssText = style;
            }, style);
        await target.hover({ force: true });
        await expect(page.locator(tooltipSelector)).toHaveAttribute(
            'data-status',
            'indeterminate',
        );
        await expect(page.locator(tooltipSelector)).not.toContainText('Pass');
    }
});

test('keeps overlay above dialogs and popovers before and during inspection', async ({
    page,
    toggle,
}) => {
    await page
        .locator('#dialog')
        .evaluate((element: HTMLDialogElement) => element.showModal());
    await toggle(page);
    await point(page, '#dialog-text');
    await expect(page.locator(tooltipSelector)).toContainText('21.00:1');
    await page
        .locator('#dialog')
        .evaluate((element: HTMLDialogElement) => element.close());
    await point(page, '#plain');
    await page
        .locator('#dialog')
        .evaluate((element: HTMLDialogElement) => element.showModal());
    await page
        .locator('#page-popover')
        .evaluate((element: HTMLElement) => element.showPopover());
    await page.locator('#dialog').evaluate((element: HTMLDialogElement) => {
        element.close();
        element.showModal();
    });
    await expect(page.locator('#dialog')).toBeVisible();
    await expect(page.locator('#page-popover')).toBeVisible();
    await point(page, '#dialog-text');
    await expect(page.locator(tooltipSelector)).toContainText('21.00:1');
    await expect
        .poll(async () =>
            page.evaluate(() => {
                const host = document.querySelector(
                    'contrast-inspector-overlay',
                )!;
                const tooltip = host.shadowRoot!.querySelector('.tooltip')!;
                const rect = tooltip.getBoundingClientRect();
                // A modal dialog makes the overlay inert, so hit testing reaches the page.
                return {
                    popover: host.matches(':popover-open'),
                    pointer: getComputedStyle(host).pointerEvents,
                    overPage:
                        document.elementFromPoint(rect.x + 3, rect.y + 3) !==
                        host,
                };
            }),
        )
        .toEqual({ popover: true, pointer: 'none', overPage: true });
});

test('updates shadow mutations and handles removal and popovers inside shadow roots', async ({
    page,
    toggle,
}) => {
    await toggle(page);
    await point(page, '#shadow #shadow-text');
    await expect(page.locator(tooltipSelector)).toContainText('9.45:1');
    await page
        .locator('#shadow #shadow-text')
        .evaluate((element: HTMLElement) => {
            element.style.color = 'black';
        });
    await point(page, '#shadow #shadow-text', 1);
    await expect(page.locator(tooltipSelector + ' .row').first()).toContainText(
        '#000000',
    );
    await page.locator('#shadow').evaluate((element) => {
        const popover = document.createElement('div');
        popover.setAttribute('popover', 'manual');
        popover.textContent = 'Shadow popover';
        element.shadowRoot!.append(popover);
        popover.showPopover();
    });
    await expect(page.locator('#shadow [popover]')).toBeVisible();
    await point(page, '#shadow #shadow-text', 2);
    await expect(page.locator(tooltipSelector)).toContainText('#000000');
    await page
        .locator('#shadow #shadow-text')
        .evaluate((element) => element.remove());
    await page.mouse.move(5, 5);
    await expect(
        page.locator(tooltipSelector + ' .element-label'),
    ).not.toContainText('#shadow-text');
});

test('positions in viewport corners and follows scrolling and resize', async ({
    page,
    toggle,
}) => {
    await toggle(page);
    await point(page, '#bottom');
    await expect(page.locator(tooltipSelector)).toHaveAttribute(
        'data-status',
        'assessed',
    );
    const pageScroll = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, -4);
    await expect
        .poll(() => page.evaluate(() => scrollY))
        .toBeLessThan(pageScroll);
    await expect
        .poll(() =>
            page.locator('#bottom').evaluate((element) => {
                const outline = document
                    .querySelector('contrast-inspector-overlay')!
                    .shadowRoot!.querySelector('.outline')!;
                return Math.abs(
                    element.getBoundingClientRect().top -
                        outline.getBoundingClientRect().top,
                );
            }),
        )
        .toBeLessThan(1);
    await page.setViewportSize({ width: 320, height: 480 });
    await expect
        .poll(() =>
            page.locator(tooltipSelector).evaluate((element) => {
                const rect = element.getBoundingClientRect();
                return (
                    rect.left >= 0 &&
                    rect.top >= 0 &&
                    rect.right <= innerWidth &&
                    rect.bottom <= innerHeight
                );
            }),
        )
        .toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator(overlaySelector)).toHaveCount(0);
});

test('restricted pages fail gracefully', async ({ page, worker, toggle }) => {
    const errors: string[] = [];
    worker.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('chrome://version');
    await toggle(page);
    // Give a rejected injection time to surface as an uncaught error.
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
    await expect(page.locator(overlaySelector)).toHaveCount(0);
});
