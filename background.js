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
    path: "", // Drive doesn't use a path prefix
    patterns: ["drive.google.com/", "drive.google.com$"],
  },
  calendar: {
    host: "calendar.google.com",
    path: "", // Calendar doesn't use a path prefix
    patterns: ["calendar.google.com/", "calendar.google.com$"],
  },
  docs: {
    host: "docs.google.com",
    path: "", // Docs doesn't use a path prefix
    patterns: [
      "docs.google.com/document",
      "docs.google.com/spreadsheets",
      "docs.google.com/presentation",
      "docs.google.com/",
      "docs.google.com$",
    ],
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
      if (url.pathname.includes(`/u/${authUser}/`)) {
        console.log(`Already at the correct account: ${authUser}`);
        return;
      }

      // Check if already at a specific account - important to avoid overriding manual navigation
      const accountMatch = url.pathname.match(/\/u\/(\d+)\//);
      if (accountMatch && accountMatch[1] !== authUser) {
        console.log(
          `URL has account pattern ${accountMatch[1]}, but want ${authUser}`
        );
        // We'll allow this redirect to continue in this case
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

          if (serviceName === "gmail") {
            // Gmail uses /mail/u/{accountNumber}/
            redirectUrl = `https://${serviceInfo.host}${serviceInfo.path}/u/${authUser}/`;
          } else {
            // Drive, Calendar, and Docs use /u/{accountNumber}/
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

        // Check against pattern list
        for (const pattern of serviceInfo.patterns) {
          if (url.href.includes(pattern)) {
            console.log(
              `Matched pattern "${pattern}" for service ${serviceName}`
            );

            // Build the proper redirect URL based on the service
            let redirectUrl;

            if (serviceName === "gmail") {
              // Gmail uses /mail/u/{accountNumber}/
              redirectUrl = `https://${serviceInfo.host}${serviceInfo.path}/u/${authUser}/`;
            } else if (
              serviceName === "docs" &&
              url.pathname.startsWith("/document")
            ) {
              // Handle Google Docs document URLs
              redirectUrl = `https://${serviceInfo.host}/document/u/${authUser}/`;
            } else if (
              serviceName === "docs" &&
              url.pathname.startsWith("/spreadsheets")
            ) {
              // Handle Google Sheets URLs
              redirectUrl = `https://${serviceInfo.host}/spreadsheets/u/${authUser}/`;
            } else if (
              serviceName === "docs" &&
              url.pathname.startsWith("/presentation")
            ) {
              // Handle Google Slides URLs
              redirectUrl = `https://${serviceInfo.host}/presentation/u/${authUser}/`;
            } else {
              // Drive, Calendar, and general Docs URLs
              redirectUrl = `https://${serviceInfo.host}/u/${authUser}/`;
            }

            console.log(`Redirecting to ${redirectUrl}`);

            // Set flag to prevent loops
            redirectInProgress = true;

            // Perform redirect
            chrome.tabs.update(details.tabId, { url: redirectUrl }, () => {
              // Reset flag after delay
              setTimeout(() => {
                redirectInProgress = false;
              }, 1500);
            });

            return;
          }
        }
      }

      // No matching service found - this is just a normal Google URL
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
