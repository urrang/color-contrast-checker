export function composedParent(element: Element): Element | null {
  if (element.assignedSlot) return element.assignedSlot;
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

export function ancestry(element: Element): Element[] {
  const elements: Element[] = [];
  for (let current: Element | null = element; current; current = composedParent(current)) {
    elements.push(current);
  }
  return elements;
}

export function targetAt(x: number, y: number, host: HTMLElement, path?: EventTarget[]): Element | null {
  const fromPath = path?.find((node): node is Element => node instanceof Element && node !== host);
  let target = fromPath ?? document.elementFromPoint(x, y);
  if (target === host || target?.getRootNode() === host.shadowRoot) return null;
  while (target?.shadowRoot) {
    const inner = target.shadowRoot.elementFromPoint(x, y);
    if (!inner || inner === target) break;
    target = inner;
  }
  return target;
}
