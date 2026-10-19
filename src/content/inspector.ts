import { assessElement, textParent } from './assessment';
import { createOverlay, type ElementLabel } from './overlay';
import { ancestry, targetAt, toTopRect } from './targeting';
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
    const documents = new WeakSet<Document>();

    function available() {
        return Boolean(
            target?.isConnected &&
            toTopRect(target.ownerDocument, target.getBoundingClientRect()),
        );
    }

    // Script-driven page changes are picked up on the next pointer movement or scroll.
    function update() {
        frame = 0;
        if (!pointer) {
            overlay.hide();
            return;
        }
        const { x, y } = pointer;
        if (!pinned) {
            const next = targetAt(x, y);
            if (next) listen(next.ownerDocument);
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
                const running = ancestry(textParent(next)).flatMap((element) =>
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
        overlay.render(result, pinned, pinned && !available(), targetLabel);
        overlay.position(target, x, y);
    }

    function schedule() {
        if (!frame && !signal.aborted) frame = requestAnimationFrame(update);
    }

    function clickSequence(event: MouseEvent) {
        if (
            !pointer ||
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
            pointer = eventPoint(event);
        }
        schedule();
    }

    function stop() {
        controller.abort();
        cancelAnimationFrame(frame);
        overlay.remove();
        delete window.__contrastInspector;
    }

    function eventPoint(event: MouseEvent) {
        const owner = (event.currentTarget as Window).document;
        const rect = toTopRect(
            owner,
            new DOMRect(event.clientX, event.clientY, 0, 0),
        );
        return rect ? { x: rect.x, y: rect.y } : null;
    }

    function move(event: PointerEvent) {
        if (!pinned) pointer = eventPoint(event);
        schedule();
    }

    function listenFrames(root: Document | ShadowRoot) {
        root.addEventListener(
            'load',
            (event) => {
                const element = event.target as Element;
                if (element.localName !== 'iframe') return;
                const child = (element as HTMLIFrameElement).contentDocument;
                if (child) listen(child);
                schedule();
            },
            { capture: true, signal },
        );
        for (const element of root.querySelectorAll('*')) {
            if (element.shadowRoot) listenFrames(element.shadowRoot);
            if (element.localName !== 'iframe') continue;
            const child = (element as HTMLIFrameElement).contentDocument;
            if (child) listen(child);
        }
    }

    function listen(owner: Document) {
        const view = owner.defaultView;
        if (!view || documents.has(owner)) return;
        documents.add(owner);
        view.addEventListener('pointermove', move, {
            capture: true,
            passive: true,
            signal,
        });
        view.addEventListener('pointerout', move, {
            capture: true,
            passive: true,
            signal,
        });
        for (const type of clickEvents) {
            view.addEventListener(type, clickSequence, {
                capture: true,
                signal,
            });
        }
        view.addEventListener(
            'keydown',
            (event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopImmediatePropagation();
                stop();
            },
            { capture: true, signal },
        );
        view.addEventListener('scroll', schedule, {
            capture: true,
            passive: true,
            signal,
        });
        view.addEventListener('resize', schedule, { passive: true, signal });
        listenFrames(owner);
    }

    listen(document);
    window.addEventListener('pagehide', stop, { once: true, signal });
    window.__contrastInspector = { stop };
}

if (window.__contrastInspector) window.__contrastInspector.stop();
else start();
