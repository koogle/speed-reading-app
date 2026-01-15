// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'speed-read-selection',
    title: 'Speed Read Selection',
    contexts: ['selection']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'speed-read-selection' && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, {
      action: 'startSpeedReading',
      text: info.selectionText
    });
  }
});

// Handle toolbar icon click
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, {
    action: 'toggleSpeedReader'
  });
});
