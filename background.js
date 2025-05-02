// Direct method to get current account selection from storage
async function getCurrentAccountSelection() {
  return new Promise((resolve) => {
    chrome.storage.sync.get("selectedAuthUser", (result) => {
      // Ensure we always use a string and handle both undefined and numeric values
      const authUser =
        result.selectedAuthUser !== undefined
          ? String(result.selectedAuthUser)
          : "0";
      console.log(
        `getCurrentAccountSelection: ${authUser} (${typeof authUser})`
      );
      resolve(authUser);
    });
  });
}

// Service mappings - keeping only Gmail
const services = {
  gmail: {
    host: "mail.google.com",
    path: "/mail",
    patterns: ["mail.google.com/mail"],
  },
  // Other services removed
};

// Flag to prevent redirect loops
let redirectInProgress = false;
let lastRedirectTime = 0;
let lastRedirectUrl = "";

// Main navigation handler
async function handleNavigation(details) {
  const currentTime = Date.now();

  // Skip if we're already handling a redirect
  if (redirectInProgress) {
    console.log(`Skipping redirect because redirectInProgress is true`);
    return;
  }

  // Skip if we just did a redirect recently (within 3 seconds)
  if (currentTime - lastRedirectTime < 3000) {
    console.log(
      `Skipping redirect - too soon after last redirect (${
        currentTime - lastRedirectTime
      }ms)`
    );
    return;
  }

  // Skip if this is the same URL we just redirected to
  if (details.url === lastRedirectUrl) {
    console.log(`Skipping redirect - same as last redirect URL`);
    return;
  }

  try {
    // Only act on main frame navigation
    if (details.frameId === 0) {
      const url = new URL(details.url);

      // Get current account selection directly from storage every time
      const authUser = await getCurrentAccountSelection();
      console.log(`NAVIGATION: ${details.url}, Current account: ${authUser}`);

      // Extract the current account number from the URL if present
      let currentUrlAccount = null;
      const pathAccountMatch = url.pathname.match(/\/u\/(\d+)\//);
      const queryAccountMatch = url.search.match(/[?&]authuser=(\d+)/);

      if (pathAccountMatch) {
        currentUrlAccount = String(pathAccountMatch[1]);
        console.log(`Detected account in path: ${currentUrlAccount}`);
      } else if (queryAccountMatch) {
        currentUrlAccount = String(queryAccountMatch[1]);
        console.log(`Detected account in query: ${currentUrlAccount}`);
      } else {
        console.log(`No account detected in URL path or query.`);
        // If no account is detected, it often defaults to 0 for Google services
        if (
          url.hostname.includes("google.com") &&
          !url.hostname.includes("accounts.google.com")
        ) {
          currentUrlAccount = "0";
          console.log(`Assuming account 0 for default Google service URL.`);
        }
      }

      // --- Primary Redirect Logic ---

      // 1. Check if we are already on the correct account
      if (currentUrlAccount === authUser) {
        console.log(`Already at the correct account: ${authUser}`);
        return;
      }

      // 2. Handle manual account switching or login pages (No redirect)
      if (
        url.search.includes("authuser=") &&
        queryAccountMatch &&
        String(queryAccountMatch[1]) !== authUser
      ) {
        const userSelectedAccount = String(queryAccountMatch[1]);
        console.log(
          `User interacting with account ${userSelectedAccount} via authuser param, respecting this choice.`
        );
        return; // Don't redirect if user is manually selecting via query param
      }
      if (
        url.hostname.includes("accounts.google.com") ||
        url.hostname.includes("myaccount.google.com") ||
        url.search.includes("AccountChooser") ||
        url.search.includes("account_chooser") ||
        url.pathname.includes("ServiceLogin") ||
        url.pathname.includes("signin")
      ) {
        console.log(
          `Account management URL detected, not redirecting: ${url.href}`
        );
        return;
      }

      // 3. If not on the correct account, determine the redirect URL
      console.log(
        `Account mismatch: URL shows ${currentUrlAccount}, selected is ${authUser}. Preparing redirect.`
      );

      let redirectUrl = null;
      // Specific handling for Gmail
      if (url.hostname === "mail.google.com") {
        let pathSuffix = "";
        // Try to preserve the path after /u/X/
        const mailPathMatch = url.pathname.match(/^\/mail\/u\/\d+\/(.*)/);
        if (mailPathMatch && mailPathMatch[1]) {
          pathSuffix = mailPathMatch[1];
        } else if (
          url.pathname.startsWith("/mail/") &&
          !url.pathname.startsWith("/mail/u/")
        ) {
          // Handle cases like /mail/ca/, /mail/&?, etc., but not the base /mail/
          pathSuffix = url.pathname.substring(6); // Get path after /mail/
        }
        // Preserve query string, removing any existing authuser param
        const searchParams = new URLSearchParams(url.search);
        searchParams.delete("authuser");
        const queryString = searchParams.toString()
          ? `?${searchParams.toString()}`
          : "";

        redirectUrl = `https://mail.google.com/mail/u/${authUser}/${pathSuffix}${queryString}`;
        console.log(`Calculated Gmail redirect URL: ${redirectUrl}`);
      }
      // Add handling for other Google services here if needed, using a similar pattern
      // else if (url.hostname === "drive.google.com") { ... }

      // 4. Perform the redirect if a URL was determined
      if (redirectUrl) {
        console.log(`Redirecting to ${redirectUrl}`);
        redirectInProgress = true;
        lastRedirectTime = currentTime;
        lastRedirectUrl = redirectUrl;
        chrome.tabs.update(details.tabId, { url: redirectUrl }, () => {
          setTimeout(() => {
            redirectInProgress = false;
          }, 3000); // Cooldown period
        });
        return;
      } else {
        console.log(
          `No specific redirect rule found for ${url.hostname}. Not redirecting.`
        );
      }

      // --- Old logic removed for clarity ---
      // The following blocks are now integrated into the logic above
      /*
      // Special handling for account 5 (authuser=4) issues
      if (authUser === "4") { ... } 
      else if (currentUrlAccount === authUser) { ... }

      // Skip if already at the correct account
      if ( url.pathname.includes(...) || url.search.includes(...) ) { ... }

      // Don't redirect if user is manually switching accounts
      if (url.search.includes("authuser=")) { ... }

      // Don't redirect on account selection pages
      if ( url.hostname.includes("accounts.google.com") ... ) { ... }

      // Check if already at a specific account - improved detection
      const accountMatch = url.pathname.match(/\/u\/(\d+)\//);
      if (accountMatch) { ... }

      // Look for matching services
      for (const [serviceName, serviceInfo] of Object.entries(services)) { ... }
      */

      // No matching service found (this part might be redundant now)
      console.log(
        `No matching service or redirect rule applied for URL: ${details.url}`
      );
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
