export function composedParent(element: Element): Element | null {
    if (element.assignedSlot) return element.assignedSlot;
    if (element.parentElement) return element.parentElement;
    const root = element.getRootNode();
    const view = element.ownerDocument.defaultView;
    return view && root instanceof view.ShadowRoot ? root.host : null;
}

export function ancestry(element: Element): Element[] {
    const elements: Element[] = [];
    for (
        let current: Element | null = element;
        current;
        current = composedParent(current)
    ) {
        elements.push(current);
    }
    return elements;
}

// Skip the overlay's pointer shield to find the page element beneath it.
export function targetAt(x: number, y: number): Element | null {
    let target =
        document
            .elementsFromPoint(x, y)
            .find(
                (element) => element.localName !== 'contrast-inspector-overlay',
            ) ?? null;
    while (target) {
        if (target.shadowRoot) {
            // Unlike elementsFromPoint, elementFromPoint preserves slotted text ownership.
            // Briefly exclude our shield from this synchronous hit test.
            const shield = document
                .querySelector('contrast-inspector-overlay')
                ?.shadowRoot?.querySelector<HTMLElement>('.shield');
            shield?.style.setProperty('pointer-events', 'none', 'important');
            const inner = target.shadowRoot.elementFromPoint(x, y);
            shield?.style.removeProperty('pointer-events');
            if (inner && inner !== target) {
                target = inner;
                continue;
            }
        }
        if (target.localName === 'iframe') {
            const iframe = target as HTMLIFrameElement;
            const child = iframe.contentDocument;
            if (child) {
                const viewport = frameViewport(iframe);
                if (!viewport) break;
                const { left, top, scaleX, scaleY } = viewport;
                x = (x - left) / scaleX;
                y = (y - top) / scaleY;
                target = child.elementFromPoint(x, y);
                continue;
            }
        }
        break;
    }
    return target;
}

export function scrollerAt(x: number, y: number, dx: number, dy: number) {
    for (
        let element = targetAt(x, y);
        element;
        element =
            composedParent(element) ??
            element.ownerDocument.defaultView?.frameElement ??
            null
    ) {
        const style =
            element.ownerDocument.defaultView!.getComputedStyle(element);
        const root = element === element.ownerDocument.scrollingElement;
        const scrollsX = root
            ? !['hidden', 'clip'].includes(style.overflowX)
            : ['auto', 'scroll'].includes(style.overflowX);
        const scrollsY = root
            ? !['hidden', 'clip'].includes(style.overflowY)
            : ['auto', 'scroll'].includes(style.overflowY);
        if (
            (scrollsX &&
                ((dx > 0 &&
                    element.scrollLeft + element.clientWidth <
                        element.scrollWidth) ||
                    (dx < 0 && element.scrollLeft > 0))) ||
            (scrollsY &&
                ((dy > 0 &&
                    element.scrollTop + element.clientHeight <
                        element.scrollHeight) ||
                    (dy < 0 && element.scrollTop > 0)))
        )
            return element;
    }
    return null;
}

// Frame borders and CSS scaling (including Storybook's zoom) affect viewport coordinates.
function frameViewport(frame: HTMLIFrameElement) {
    for (const element of ancestry(frame)) {
        const style = getComputedStyle(element);
        const matrix = new DOMMatrixReadOnly(style.transform);
        if (
            !matrix.is2D ||
            matrix.b !== 0 ||
            matrix.c !== 0 ||
            matrix.a <= 0 ||
            matrix.d <= 0 ||
            style.rotate !== 'none' ||
            style.perspective !== 'none' ||
            style.scale.split(' ').some((value) => parseFloat(value) <= 0)
        )
            return null;
    }
    const rect = frame.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const style = getComputedStyle(frame);
    const left =
        parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
    const top = parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop);
    // offsetWidth/offsetHeight are rounded to integers, so derive the unscaled border box from computed style.
    let width = parseFloat(style.width);
    let height = parseFloat(style.height);
    if (style.boxSizing !== 'border-box') {
        width +=
            left +
            parseFloat(style.paddingRight) +
            parseFloat(style.borderRightWidth);
        height +=
            top +
            parseFloat(style.paddingBottom) +
            parseFloat(style.borderBottomWidth);
    }
    const scaleX = rect.width / width;
    const scaleY = rect.height / height;
    return {
        left: rect.left + left * scaleX,
        top: rect.top + top * scaleY,
        scaleX,
        scaleY,
    };
}

export function toTopRect(owner: Document, rect: DOMRect): DOMRect | null {
    while (owner !== document) {
        const frame = owner.defaultView
            ?.frameElement as HTMLIFrameElement | null;
        if (!frame?.isConnected || frame.contentDocument !== owner) return null;
        const viewport = frameViewport(frame);
        if (!viewport) return null;
        const { left, top, scaleX, scaleY } = viewport;
        rect = new DOMRect(
            left + rect.x * scaleX,
            top + rect.y * scaleY,
            rect.width * scaleX,
            rect.height * scaleY,
        );
        owner = frame.ownerDocument;
    }
    return rect;
}
