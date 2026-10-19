import { assessElement } from './assessment';
import { createOverlay } from './overlay';
import { ancestry, targetAt } from './targeting';
import type { Result } from '../core/types';

declare global {
    interface Window {
        __contrastInspector?: { stop: () => void };
    }
}

const clickEvents = [
    'pointerdown',
    'pointerup',
    'mousedown',
    'mouseup',
    'click',
    'dblclick',
] as const;
const animationEvents = [
    'transitionrun',
    'transitionend',
    'transitioncancel',
    'animationstart',
    'animationend',
];
const observation = {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
};

function hasRunningAnimation(element: Element): boolean {
    return ancestry(element).some((current) =>
        current
            .getAnimations()
            .some(
                (animation) =>
                    animation.playState === 'running' || animation.pending,
            ),
    );
}

function start() {
    const overlay = createOverlay();
    const controller = new AbortController();
    const { signal } = controller;
    const roots = new Set<ShadowRoot>();
    let topLayers = new Set<Element>();
    let target: Element | null = null;
    let result: Result | null = null;
    let pinned = false;
    let x = Math.round(innerWidth / 2);
    let y = Math.round(innerHeight / 2);
    let path: EventTarget[] | undefined;
    let frame = 0;
    let stopped = false;
    let needsAssessment = true;
    let lastDisplay = '';

    function update() {
        frame = 0;
        if (stopped) return;
        if (!pinned) {
            const next = targetAt(x, y, overlay.host, path);
            path = undefined;
            if (next !== target) {
                needsAssessment = true;
                const root = next?.getRootNode();
                if (root instanceof ShadowRoot && !roots.has(root))
                    observeRoots(root.host);
            }
            target = next;
            if (needsAssessment) {
                result = target ? assessElement(target) : null;
                needsAssessment = false;
            }
        }
        const unavailable = pinned && !target?.isConnected;
        const display = JSON.stringify([result, pinned, unavailable]);
        if (display !== lastDisplay) {
            overlay.render(result, pinned, unavailable);
            lastDisplay = display;
        }
        overlay.position(target, x, y);
        if (!pinned && target && hasRunningAnimation(target)) {
            needsAssessment = true;
            schedule();
        }
    }

    function schedule() {
        if (!frame && !stopped) frame = requestAnimationFrame(update);
    }

    function refresh() {
        needsAssessment = true;
        path = undefined;
        schedule();
    }

    function move(event: PointerEvent) {
        if (pinned) return;
        x = event.clientX;
        y = event.clientY;
        path = event.composedPath();
        needsAssessment = true;
        schedule();
    }

    function clickSequence(event: MouseEvent) {
        if (
            event.button !== 0 ||
            (event.type === 'click' && event.detail === 0)
        )
            return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.type !== 'click') return;
        // Pinning keeps the result already on screen; unpinning reassesses at the click position.
        pinned = !pinned;
        if (!pinned) {
            x = event.clientX;
            y = event.clientY;
            path = undefined;
            needsAssessment = true;
        }
        schedule();
    }

    // Open dialogs/popovers can be promoted above us without pointer movement, including when pinned.
    function checkTopLayer() {
        const layers = [document, ...roots]
            .flatMap((root) =>
                Array.from(root.querySelectorAll(':modal, :popover-open')),
            )
            .filter((el) => el !== overlay.host && el.isConnected);
        if (layers.some((element) => !topLayers.has(element))) {
            overlay.raise();
        }
        topLayers = new Set(layers);
    }

    function topLayerToggle(event: Event) {
        if (
            event.target instanceof Element &&
            event.target !== overlay.host &&
            event.target.matches(':modal, :popover-open')
        )
            overlay.raise();
        checkTopLayer();
    }

    // The overlay's shadow root is never observed, so only attribute changes on its host need ignoring.
    const observer = new MutationObserver((mutations) => {
        if (mutations.every((mutation) => mutation.target === overlay.host))
            return;
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node instanceof Element) observeRoots(node);
            }
        }
        checkTopLayer();
        refresh();
    });

    function observeRoots(parent: Element | ShadowRoot) {
        const elements =
            parent instanceof Element
                ? [parent, ...parent.querySelectorAll('*')]
                : parent.querySelectorAll('*');
        for (const element of elements) {
            if (
                element === overlay.host ||
                !element.shadowRoot ||
                roots.has(element.shadowRoot)
            )
                continue;
            roots.add(element.shadowRoot);
            observer.observe(element.shadowRoot, observation);
            element.shadowRoot.addEventListener('toggle', topLayerToggle, {
                capture: true,
                signal,
            });
            for (const type of animationEvents) {
                element.shadowRoot.addEventListener(type, refresh, {
                    capture: true,
                    signal,
                });
            }
            observeRoots(element.shadowRoot);
        }
    }

    function stop() {
        stopped = true;
        controller.abort();
        observer.disconnect();
        clearInterval(topLayerCheck);
        if (frame) cancelAnimationFrame(frame);
        overlay.remove();
        delete window.__contrastInspector;
    }

    window.addEventListener('pointermove', move, {
        capture: true,
        passive: true,
        signal,
    });
    window.addEventListener(
        'pointerout',
        (event) => {
            if (pinned) return;
            // Movement inside frames does not bubble into the top-level document.
            x = event.clientX;
            y = event.clientY;
            refresh();
        },
        { capture: true, passive: true, signal },
    );
    for (const type of clickEvents) {
        window.addEventListener(type, clickSequence, { capture: true, signal });
    }
    window.addEventListener(
        'keydown',
        (event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopImmediatePropagation();
            stop();
        },
        { capture: true, signal },
    );
    window.addEventListener('scroll', refresh, {
        capture: true,
        passive: true,
        signal,
    });
    window.addEventListener('resize', refresh, { passive: true, signal });
    window.addEventListener('pagehide', stop, { once: true, signal });
    for (const type of animationEvents) {
        window.addEventListener(type, refresh, { capture: true, signal });
    }
    window.addEventListener('toggle', topLayerToggle, {
        capture: true,
        signal,
    });
    const topLayerCheck = setInterval(() => {
        checkTopLayer();
        if (pinned) schedule();
    }, 200);
    observer.observe(document.documentElement, observation);
    observeRoots(document.documentElement);
    checkTopLayer();
    window.__contrastInspector = { stop };
    schedule();
}

if (window === window.top) {
    if (window.__contrastInspector) window.__contrastInspector.stop();
    else start();
}
