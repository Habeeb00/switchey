let selectedAuthUser = "0";

// Load selected user on startup
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.sync.get(
    "selectedAuthUser",
    ({ selectedAuthUser: stored }) => {
      if (stored !== undefined) selectedAuthUser = stored;
    }
  );
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(
    "selectedAuthUser",
    ({ selectedAuthUser: stored }) => {
      if (stored !== undefined) selectedAuthUser = stored;
    }
  );
});

// Watch for updates to selection
chrome.storage.onChanged.addListener((changes) => {
  if (changes.selectedAuthUser) {
    selectedAuthUser = changes.selectedAuthUser.newValue;
  }
});

const services = {
  "calendar.google.com": "/calendar",
  "mail.google.com": "/mail",
  "drive.google.com": "/drive",
  "docs.google.com": "/document",
};

chrome.webRequest.onBeforeRequest.addListener(
  function (details) {
    const url = new URL(details.url);
    const servicePath = services[url.hostname];
    if (!servicePath) return;

    // Skip if already using /u/X
    if (url.pathname.startsWith(`${servicePath}/u/`)) return;

    const newUrl = `https://${url.hostname}${servicePath}/u/${selectedAuthUser}/`;
    return { redirectUrl: newUrl };
  },
  {
    urls: [
      "*://calendar.google.com/*",
      "*://mail.google.com/*",
      "*://drive.google.com/*",
      "*://docs.google.com/*",
    ],
    types: ["main_frame"],
  },
  ["blocking"]
);
