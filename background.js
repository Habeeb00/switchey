// Direct method to get current account selection from storage
async function getCurrentAccountSelection() {
  return new Promise((resolve) => {
    chrome.storage.sync.get("selectedAuthUser", (result) => {
      const authUser = result.selectedAuthUser || "0";
      console.log(
        `getCurrentAccountSelection: ${authUser} (${typeof authUser})`
      );
      resolve(authUser.toString());
    });
  });
}

// Service mappings with correct URL patterns for each Google service
const services = {
  gmail: {
    host: "mail.google.com",
    path: "/mail",
    patterns: ["mail.google.com/mail"],
  },
  drive: {
    host: "drive.google.com",
    path: "",
    patterns: [
      "drive.google.com/drive",
      "drive.google.com/file",
      "drive.google.com/folder",
      "drive.google.com/?",
      "drive.google.com$",
    ],
  },
  calendar: {
    host: "calendar.google.com",
    path: "",
    patterns: [
      "calendar.google.com/calendar",
      "calendar.google.com/event",
      "calendar.google.com/?",
      "calendar.google.com$",
    ],
  },
  docs: {
    host: "docs.google.com",
    path: "",
    patterns: [
      "docs.google.com/document",
      "docs.google.com/spreadsheets",
      "docs.google.com/presentation",
      "docs.google.com/forms",
      "docs.google.com/drawings",
      "docs.google.com/?",
      "docs.google.com$",
    ],
  },
  // New services
  youtube: {
    host: "youtube.com",
    path: "",
    patterns: ["youtube.com", "www.youtube.com"],
    needsAccountParam: true, // YouTube uses ?authuser= instead of /u/
  },
  photos: {
    host: "photos.google.com",
    path: "",
    patterns: ["photos.google.com"],
  },
  meet: {
    host: "meet.google.com",
    path: "",
    patterns: ["meet.google.com"],
  },
  maps: {
    host: "maps.google.com",
    path: "",
    patterns: ["maps.google.com", "www.google.com/maps"],
    needsAccountParam: true, // Maps uses ?authuser= instead of /u/
  },
  keep: {
    host: "keep.google.com",
    path: "",
    patterns: ["keep.google.com"],
  },
  chat: {
    host: "chat.google.com",
    path: "",
    patterns: ["chat.google.com"],
  },
  contacts: {
    host: "contacts.google.com",
    path: "",
    patterns: ["contacts.google.com"],
  },
};

// Flag to prevent redirect loops
let redirectInProgress = false;

// Main navigation handler
async function handleNavigation(details) {
  // Skip if we're already handling a redirect
  if (redirectInProgress) {
    return;
  }

  try {
    // Only act on main frame navigation
    if (details.frameId === 0) {
      const url = new URL(details.url);

      // Get current account selection directly from storage every time
      const authUser = await getCurrentAccountSelection();
      console.log(`NAVIGATION: ${details.url}, Current account: ${authUser}`);

      // Skip if already at the correct account
      if (url.pathname.includes(`/u/${authUser}/`) || url.search.includes(`authuser=${authUser}`)) {
        console.log(`Already at the correct account: ${authUser}`);
        return;
      }

      // Don't redirect if user is manually switching accounts
      if (url.search.includes("authuser=")) {
        console.log(`URL has explicit authuser parameter, not redirecting`);
        return;
      }

      // Check if already at a specific account
      const accountMatch = url.pathname.match(/\/u\/(\d+)\//);
      if (accountMatch && accountMatch[1] !== authUser) {
        console.log(`URL has account pattern ${accountMatch[1]}, but want ${authUser}`);
      }

      // Special case for YouTube on google.com domain
      if (url.hostname === "www.google.com" && url.pathname.startsWith("/youtube")) {
        const redirectUrl = `https://youtube.com/?authuser=${authUser}`;
        console.log(`Redirecting YouTube shortcut to ${redirectUrl}`);

        redirectInProgress = true;
        chrome.tabs.update(details.tabId, { url: redirectUrl }, () => {
          setTimeout(() => { redirectInProgress = false; }, 1500);
        });
        return;
      }

      // Special case for Google Maps on google.com domain
      if (url.hostname === "www.google.com" && url.pathname.startsWith("/maps")) {
        const redirectUrl = `https://maps.google.com/?authuser=${authUser}`;
        console.log(`Redirecting Maps to ${redirectUrl}`);

        redirectInProgress = true;
        chrome.tabs.update(details.tabId, { url: redirectUrl }, () => {
          setTimeout(() => { redirectInProgress = false; }, 1500);
        });
        return;
      }

      // Look for matching services
      for (const [serviceName, serviceInfo] of Object.entries(services)) {
        // Special handling for base URLs with no path
        if (
          url.hostname === serviceInfo.host &&
          (url.pathname === "/" || url.pathname === "")
        ) {
          console.log(`Matched base URL for ${serviceName}`);

          // Build the proper redirect URL based on the service
          let redirectUrl;

          if (serviceInfo.needsAccountParam) {
            // Services using authuser parameter instead of path
            redirectUrl = `https://${serviceInfo.host}${url.pathname}?authuser=${authUser}`;

            // Preserve existing query parameters except authuser
            const searchParams = new URLSearchParams(url.search);
            searchParams.delete("authuser");
            if (searchParams.toString()) {
              redirectUrl += `&${searchParams.toString()}`;
            }
          } else if (serviceName === "gmail") {
            redirectUrl = `https://${serviceInfo.host}${serviceInfo.path}/u/${authUser}/`;
          } else {
            redirectUrl = `https://${serviceInfo.host}/u/${authUser}/`;
          }

          console.log(`Redirecting base URL to ${redirectUrl}`);

          redirectInProgress = true;
          chrome.tabs.update(details.tabId, { url: redirectUrl }, () => {
            setTimeout(() => {
              redirectInProgress = false;
            }, 1500);
          });
          return;
        }

        // Check if URL hostname matches service hostname
        if (url.hostname === serviceInfo.host || 
           (serviceName === "youtube" && (url.hostname === "www.youtube.com" || url.hostname === "youtube.com")) ||
           (serviceName === "maps" && (url.hostname === "maps.google.com" || url.hostname === "www.google.com") && url.pathname.startsWith("/maps"))) {
          
          // For Drive, handle special case of folder paths
          if (
            serviceName === "drive" &&
            url.pathname.startsWith("/drive/folders")
          ) {
            const redirectUrl = `https://${
              serviceInfo.host
            }/drive/u/${authUser}/folders${url.pathname.substring(14)}`;
            console.log(`Redirecting Drive folder to ${redirectUrl}`);

            redirectInProgress = true;
            chrome.tabs.update(details.tabId, { url: redirectUrl }, () => {
              setTimeout(() => {
                redirectInProgress = false;
              }, 1500);
            });
            return;
          }

          // For Drive, handle special case of file paths
          if (
            serviceName === "drive" &&
            url.pathname.startsWith("/drive/file")
          ) {
            const redirectUrl = `https://${
              serviceInfo.host
            }/drive/u/${authUser}/file${url.pathname.substring(11)}`;
            console.log(`Redirecting Drive file to ${redirectUrl}`);

            redirectInProgress = true;
            chrome.tabs.update(details.tabId, { url: redirectUrl }, () => {
              setTimeout(() => {
                redirectInProgress = false;
              }, 1500);
            });
            return;
          }

          // Check against pattern list for more specific matches
          for (const pattern of serviceInfo.patterns) {
            if (url.href.includes(pattern)) {
              console.log(`Matched pattern "${pattern}" for service ${serviceName}`);

              let redirectUrl;

              if (serviceInfo.needsAccountParam) {
                // Services using authuser parameter
                const baseUrl = url.origin + url.pathname;
                redirectUrl = `${baseUrl}?authuser=${authUser}`;

                // Preserve existing query parameters except authuser
                const searchParams = new URLSearchParams(url.search);
                searchParams.delete("authuser");
                if (searchParams.toString()) {
                  redirectUrl += `&${searchParams.toString()}`;
                }
              } else if (serviceName === "gmail") {
                redirectUrl = `https://${serviceInfo.host}${serviceInfo.path}/u/${authUser}/`;
              } else if (serviceName === "docs") {
                // Handle different Google Docs applications
                if (url.pathname.startsWith("/document")) {
                  redirectUrl = `https://${serviceInfo.host}/document/u/${authUser}/`;
                } else if (url.pathname.startsWith("/spreadsheets")) {
                  redirectUrl = `https://${serviceInfo.host}/spreadsheets/u/${authUser}/`;
                } else if (url.pathname.startsWith("/presentation")) {
                  redirectUrl = `https://${serviceInfo.host}/presentation/u/${authUser}/`;
                } else if (url.pathname.startsWith("/forms")) {
                  redirectUrl = `https://${serviceInfo.host}/forms/u/${authUser}/`;
                } else {
                  redirectUrl = `https://${serviceInfo.host}/u/${authUser}/`;
                }
              } else if (serviceName === "calendar") {
                // Calendar with specific path
                if (url.pathname.startsWith("/calendar/")) {
                  redirectUrl = `https://${serviceInfo.host}/calendar/u/${authUser}/`;
                } else {
                  redirectUrl = `https://${serviceInfo.host}/u/${authUser}/`;
                }
              } else {
                // Default for Drive and other services
                redirectUrl = `https://${serviceInfo.host}/u/${authUser}/`;
              }

              console.log(`Redirecting to ${redirectUrl}`);

              // Set flag to prevent loops
              redirectInProgress = true;

              // Perform redirect
              chrome.tabs.update(details.tabId, { url: redirectUrl }, () => {
                setTimeout(() => {
                  redirectInProgress = false;
                }, 1500);
              });

              return;
            }
          }
        }
      }

      // No matching service found
      console.log(`No matching service for URL: ${details.url}`);
    }
  } catch (error) {
    console.error("Error in handleNavigation:", error);
    redirectInProgress = false;
  }
}

// Listen for both committed and completed navigation events to catch all cases
chrome.webNavigation.onCommitted.addListener(handleNavigation, {
  url: [{ hostSuffix: "google.com" }],
});

chrome.webNavigation.onCompleted.addListener(handleNavigation, {
  url: [{ hostSuffix: "google.com" }],
});

// Listen for tab updates as a backup method
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    tab.url.includes("google.com")
  ) {
    handleNavigation({
      frameId: 0,
      url: tab.url,
      tabId: tabId,
    });
  }
});

// Listen for storage changes to log them
chrome.storage.onChanged.addListener((changes, area) => {
  if (changes.selectedAuthUser) {
    const newValue = changes.selectedAuthUser.newValue;
    const oldValue = changes.selectedAuthUser.oldValue;
    console.log(
      `STORAGE CHANGED: selectedAuthUser from ${oldValue} to ${newValue}`
    );
  }
});

// Install handler
chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed/updated");

  // Clear any static rules we might have
  chrome.declarativeNetRequest
    .updateSessionRules({
      removeRuleIds: Array.from({ length: 10 }, (_, i) => i + 1),
    })
    .catch((err) => console.error("Failed to clear rules:", err));

  // Display current storage contents
  chrome.storage.sync.get(null, (items) => {
    console.log("Current storage contents:", items);
  });
});

// Startup handler
chrome.runtime.onStartup.addListener(() => {
  console.log("Extension started");

  // Display current storage contents on startup
  chrome.storage.sync.get(null, (items) => {
    console.log("Storage contents at startup:", items);
  });
});
