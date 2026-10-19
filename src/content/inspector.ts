import { assessElement } from './assessment';
import { createOverlay, type ElementLabel } from './overlay';
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

function start() {
    const overlay = createOverlay();
    const controller = new AbortController();
    const { signal } = controller;
    let target: Element | null = null;
    let result: Result | null = null;
    let targetLabel: ElementLabel | null = null;
    let pinned = false;
    let pointer: { x: number; y: number } | null = null;
    let frame = 0;

    // Script-driven page changes are picked up on the next pointer movement or scroll.
    function update() {
        frame = 0;
        if (!pointer) return;
        const { x, y } = pointer;
        if (!pinned) {
            const next = targetAt(x, y);
            result = next ? assessElement(next) : null;
            targetLabel = next
                ? {
                      tag: next.localName,
                      id: next.id,
                      classes: Array.from(next.classList),
                  }
                : null;
            // Hovering a new target can start transitions on it or its ancestors; reassess when they end.
            if (next && next !== target) {
                const running = ancestry(next).flatMap((element) =>
                    element.getAnimations(),
                );
                Promise.allSettled(
                    running.map((animation) => animation.finished),
                ).then(schedule);
            }
            target = next;
        }
        // Puts the overlay back above dialogs and popovers the page opened since.
        overlay.raise();
        overlay.render(
            result,
            pinned,
            pinned && !target?.isConnected,
            targetLabel,
        );
        overlay.position(target, x, y);
    }

    function schedule() {
        if (!frame && !signal.aborted) frame = requestAnimationFrame(update);
    }

    function clickSequence(event: MouseEvent) {
        if (
            event.button !== 0 ||
            (event.type === 'click' && event.detail === 0)
        )
            return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.type !== 'click' || !target) return;
        // Pinning keeps the result already on screen; unpinning reassesses at the click position.
        pinned = !pinned;
        if (!pinned) {
            pointer = { x: event.clientX, y: event.clientY };
        }
        schedule();
    }

    function stop() {
        controller.abort();
        cancelAnimationFrame(frame);
        overlay.remove();
        delete window.__contrastInspector;
    }

    window.addEventListener(
        'pointermove',
        (event) => {
            if (!pinned) {
                pointer = { x: event.clientX, y: event.clientY };
            }
            schedule();
        },
        { capture: true, passive: true, signal },
    );
    window.addEventListener(
        'pointerout',
        (event) => {
            if (pinned || !pointer) return;
            // Movement inside frames does not bubble into the top-level document.
            pointer = { x: event.clientX, y: event.clientY };
            schedule();
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
    window.addEventListener('scroll', schedule, {
        capture: true,
        passive: true,
        signal,
    });
    window.addEventListener('resize', schedule, { passive: true, signal });
    window.addEventListener('pagehide', stop, { once: true, signal });
    window.__contrastInspector = { stop };
}

if (window.__contrastInspector) window.__contrastInspector.stop();
else start();
