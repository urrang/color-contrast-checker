chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id === undefined) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [0] },
      files: ['inspector.js'],
    });
    await chrome.action.setTitle({ tabId: tab.id, title: 'Toggle Contrast Inspector' });
  } catch {
    // Chrome rejects injection on internal pages, the Web Store, and other protected documents.
    await chrome.action.setTitle({
      tabId: tab.id,
      title: 'Contrast Inspector is unavailable on this page',
    }).catch(() => {});
  }
});
