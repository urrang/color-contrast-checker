import { assessElement, resolveTextTarget, textParent } from './assessment';
import { createOverlay } from './overlay';
import { ancestry, scrollerAt, targetAt, toTopRect } from './targeting';

declare global {
    interface Window {
        __contrastInspector?: { stop: () => void };
    }
}

function start() {
    const overlay = createOverlay();
    const controller = new AbortController();
    const { signal } = controller;
    let target: Element | null = null;
    let targetHovered = false;
    let pointer: { x: number; y: number } | null = null;
    let frame = 0;
    const documents = new WeakSet<Document>();

    // Script-driven page changes are picked up on the next pointer movement or scroll.
    function update() {
        frame = 0;
        if (!pointer) {
            overlay.hide();
            return;
        }
        const { x, y } = pointer;
        const hit = targetAt(x, y);
        const next = hit ? resolveTextTarget(hit) : null;
        if (next) listen(next.ownerDocument);
        const result = next ? assessElement(next) : null;
        const targetLabel = next
            ? {
                  tag: next.localName,
                  id: next.id,
                  classes: Array.from(next.classList),
              }
            : null;
        const hovered = next?.matches(':hover') ?? false;
        // A new target or Shift changing its hover state can start transitions on its ancestry.
        if (next && (next !== target || hovered !== targetHovered)) {
            const running = ancestry(textParent(next)).flatMap((element) =>
                element.getAnimations(),
            );
            Promise.allSettled(
                running.map((animation) => animation.finished),
            ).then(schedule);
        }
        target = next;
        targetHovered = hovered;
        // Puts the overlay back above dialogs and popovers the page opened since.
        overlay.raise();
        overlay.render(result, targetLabel);
        overlay.position(target, x, y);
    }

    function schedule() {
        if (!frame && !signal.aborted) frame = requestAnimationFrame(update);
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
        // Layout-triggered pointerout events can report shiftKey=false while Shift is held.
        if (event.type === 'pointermove')
            overlay.letHoverThrough(event.shiftKey);
        pointer = eventPoint(event);
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
        view.addEventListener(
            'keydown',
            (event) => {
                overlay.letHoverThrough(event.shiftKey);
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopImmediatePropagation();
                stop();
            },
            { capture: true, signal },
        );
        view.addEventListener(
            'keyup',
            (event) => overlay.letHoverThrough(event.shiftKey),
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
    window.addEventListener(
        'wheel',
        (event) => {
            if (event.target !== overlay.host || event.ctrlKey) return;
            const scroller = scrollerAt(
                event.clientX,
                event.clientY,
                event.deltaX,
                event.deltaY,
            );
            if (!scroller || scroller === document.scrollingElement) return;
            event.preventDefault();
            scroller.scrollBy({
                left: event.deltaX,
                top: event.deltaY,
                behavior: 'instant',
            });
        },
        { capture: true, passive: false, signal },
    );
    window.addEventListener('pagehide', stop, { once: true, signal });
    window.__contrastInspector = { stop };
}

if (window.__contrastInspector) window.__contrastInspector.stop();
else start();
