chrome.action.onClicked.addListener((tab) => {
    if (tab.id === undefined) return;
    // Chrome rejects injection on internal pages, the Web Store, and other protected documents.
    chrome.scripting
        .executeScript({ target: { tabId: tab.id }, files: ['inspector.js'] })
        .catch(() => {});
});
