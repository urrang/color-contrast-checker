export function composedParent(element: Element): Element | null {
    if (element.assignedSlot) return element.assignedSlot;
    if (element.parentElement) return element.parentElement;
    const root = element.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
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

// The overlay is pointer-transparent, so hit testing never returns it.
export function targetAt(x: number, y: number): Element | null {
    let target = document.elementFromPoint(x, y);
    while (target?.shadowRoot) {
        const inner = target.shadowRoot.elementFromPoint(x, y);
        if (!inner || inner === target) break;
        target = inner;
    }
    return target;
}
