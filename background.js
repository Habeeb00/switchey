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
    patterns: [
      "mail.google.com/mail",
      "mail.google.com/mail/?tab=rm", // Add Gmail button URL pattern
      "mail.google.com/mail?tab=rm"   // Also match without the slash
    ],
  },
  // Other services removed
};

// Flag to prevent redirect loops
let redirectInProgress = false;
let lastRedirectTime = 0;
let lastRedirectUrl = "";

// Track the highest account number detected and store email addresses
function updateDetectedAccounts(accountNumber, email = null) {
  if (accountNumber === null || isNaN(parseInt(accountNumber))) return;
  
  const accountNum = parseInt(accountNumber);
  chrome.storage.local.get(['detectedAccounts', 'accountEmails'], (result) => {
    const currentHighest = result.detectedAccounts || 1; // Default to at least 1 account
    const accountEmails = result.accountEmails || {};
    
    // Update highest account count if needed
    if (accountNum + 1 > currentHighest) { // +1 because account numbers are 0-based
      chrome.storage.local.set({ detectedAccounts: accountNum + 1 });
      console.log(`Updated detected accounts count to ${accountNum + 1}`);
    }
    
    // Store email if provided
    if (email) {
      accountEmails[accountNum] = email;
      chrome.storage.local.set({ accountEmails: accountEmails });
      console.log(`Associated email ${email} with account ${accountNum}`);
    }
  });
}

// Function to extract email from Gmail page
function extractEmailFromPage(tabId) {
  chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // Helper function to extract ONLY Gmail addresses without names
      const extractEmail = (text) => {
        if (!text) return null;
        
        // First, handle text that might have names with email in parens like: "John Smith (johnsmith@gmail.com)"
        const parenthesesMatch = text.match(/\(([\w.+-]+@gmail\.com)\)/i);
        if (parenthesesMatch && parenthesesMatch[1]) {
          // Extract just the email from between parentheses - using capture group for more precision
          return parenthesesMatch[1].toLowerCase();
        }
        
        // Extract a clean Gmail pattern from anywhere in the text
        const gmailMatch = text.match(/([\w.+-]+@gmail.com)/i);
        if (gmailMatch && gmailMatch[1]) {
          return gmailMatch[1].toLowerCase(); // Return only the matched Gmail portion and ensure lowercase
        }
        
        // More lenient approach as last resort, but still only get the email part
        if (text.toLowerCase().includes('@gmail.com')) {
          // Find the @ position and work back to find a likely username
          const atPosition = text.toLowerCase().indexOf('@gmail.com');
          if (atPosition > 0) {
            // Extract what's likely the username before @gmail.com
            let startPos = atPosition;
            while (startPos > 0 && /[\w.+-]/.test(text[startPos-1])) {
              startPos--;
            }
            const username = text.substring(startPos, atPosition);
            if (username) {
              return username + '@gmail.com';
            }
          }
        }
        
        return null;
      };
      
      // 1. Look for elements with data-email attribute (most reliable)
      const elementsWithDataEmail = document.querySelectorAll('[data-email]');
      for (const el of elementsWithDataEmail) {
        const email = el.getAttribute('data-email');
        if (email && email.includes('@')) {
          return email; // This is already an email format
        }
      }
      
      // 2. Try Google account profile selectors
      const possibleSelectors = [
        '.gb_Bb', '.gb_Ad', '.gb_A', '.gb_C', '.gb_Da', // Older selectors
        '.gb_1b', '.gb_2b', '.gb_d', // Newer selectors
        '.gb_mb', '.gb_lb', '.gb_kb', // More generic areas
        '.gb_Fa', '.gb_Da', '.gb_Jb', // Profile elements
        '.gb_Ba', '.gb_Ea' // Additional profile classes
      ];
      
      for (const selector of possibleSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          const text = el.textContent || '';
          const email = extractEmail(text);
          if (email) return email;
          
          // Check aria-label too
          if (el.getAttribute('aria-label')) {
            const emailFromLabel = extractEmail(el.getAttribute('aria-label'));
            if (emailFromLabel) return emailFromLabel;
          }
        }
      }
      
      // 3. Check elements with aria-label containing @
      const ariaLabelElements = document.querySelectorAll('[aria-label*="@"]');
      for (const el of ariaLabelElements) {
        const label = el.getAttribute('aria-label');
        const email = extractEmail(label);
        if (email) return email;
      }
      
      // 4. Check menu items which often contain emails
      const menuItems = document.querySelectorAll('[role="menuitem"]');
      for (const item of menuItems) {
        const text = item.textContent || '';
        const email = extractEmail(text);
        if (email) return email;
      }
      
      // 5. Last resort: find any element with a valid email pattern
      // Limit to shorter elements to avoid capturing large text blocks
      const allElements = Array.from(document.querySelectorAll('*'))
        .filter(el => {
          const text = el.textContent || '';
          return text.includes('@') && text.length < 100;
        });
        
      for (const el of allElements) {
        const text = el.textContent || '';
        const email = extractEmail(text);
        if (email) return email;
      }
      
      return null;
    }
  }, (results) => {
    if (results && results[0] && results[0].result) {
      const email = results[0].result;
      
      // Verify this is a valid Gmail address before proceeding
      if (!email || !email.toLowerCase().includes('@gmail.com')) {
        console.log('Non-Gmail address found, ignoring:', email);
        return;
      }
      
      console.log('Valid Gmail address found:', email);
      
      // Get the current URL to extract the account number
      chrome.tabs.get(tabId, (tab) => {
        try {
          const url = new URL(tab.url);
          let accountNumber = null;
          const pathAccountMatch = url.pathname.match(/\/u\/(\d+)\//);
          const queryAccountMatch = url.search.match(/[?&]authuser=(\d+)/);
          
          if (pathAccountMatch) {
            accountNumber = String(pathAccountMatch[1]);
          } else if (queryAccountMatch) {
            accountNumber = String(queryAccountMatch[1]);
          } else if (url.hostname.includes('google.com')) {
            accountNumber = "0";
          }
          
          if (accountNumber !== null && email) {
            updateDetectedAccounts(accountNumber, email);
          }
        } catch (error) {
          console.error("Error extracting account info:", error);
        }
      });
    }
  });
}

// Last URL with intentional account switch flag
let lastAccountSwitcherUrl = null;
let lastUserSwitchTime = 0;

// Main navigation handler
function handleNavigation(details) {
  // Skip if already redirecting to prevent loops
  if (redirectInProgress) {
    console.log("Redirect already in progress, skipping");
    return;
  }
  
  try {
    // Check if this is coming from a Google account switcher menu
    const isFromAccountSwitcher = isAccountSwitcherNavigation(details);
    
    // If this is from the account menu or within the grace period of a user switch
    if (isFromAccountSwitcher) {
      console.log("Detected navigation from account switcher, allowing user choice");
      lastAccountSwitcherUrl = details.url;
      lastUserSwitchTime = Date.now();
      return; // Allow the navigation without redirect
    }
    
    // If we're within 10 seconds of a user-initiated account switch
    if (Date.now() - lastUserSwitchTime < 10000) {
      console.log("Within grace period of user account switch, allowing navigation");
      return;
    }
    
    // Check manual mode as a fallback
    chrome.storage.local.get(['manualMode'], (result) => {
      const manualMode = !!result.manualMode;
      if (manualMode) {
        console.log("Manual switching mode enabled, skipping redirection");
        return;
      }
      // Continue with normal navigation handling
      handleNavigationInternal(details);
    });
    return; // Return early as we're handling asynchronously
  } catch (error) {
    console.error("Error in navigation handler:", error);
    // Continue with normal navigation if there's an error
  }
}

// Helper to determine if navigation is from account switcher
function isAccountSwitcherNavigation(details) {
  try {
    // Parse the URL
    const url = new URL(details.url);
    
    // Look for common indicators of account switching
    
    // 1. Check for the authuser parameter in the URL with a referrer from accounts.google.com
    if (url.searchParams.has('authuser') && details.transitionType === 'link') {
      return true;
    }
    
    // 2. Check for account switching URLs
    if (url.pathname.includes('/AccountChooser') || 
        url.pathname.includes('/signin/selectaccount') ||
        url.pathname.includes('/signinchooser')) {
      return true;
    }
    
    // 3. Check redirect_uri parameter for account switching
    if (url.searchParams.has('redirect_uri') && 
        url.searchParams.get('redirect_uri').includes('authuser=')) {
      return true;
    }
    
    // 4. Switching between accounts in URL path /u/{n}/
    const pathAccountMatch = url.pathname.match(/\/u\/(\d+)\//);  // Match /u/{number}/ in the path
    if (pathAccountMatch && details.transitionType === 'link') {
      return true;
    }
    
    return false;
  } catch (error) {
    console.error("Error checking account switcher navigation:", error);
    return false;
  }
}

// Internal navigation handler that runs after manual mode check
async function handleNavigationInternal(details) {
  const currentTime = Date.now();

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
  
  // Try to extract email address after the page has loaded
  if (details.frameId === 0 && details.url.includes('google.com') && !details.url.includes('accounts.google.com/signin')) {
    // Try multiple times with increasing delays to catch different loading states
    setTimeout(() => extractEmailFromPage(details.tabId), 2000);
    setTimeout(() => extractEmailFromPage(details.tabId), 5000);
    setTimeout(() => extractEmailFromPage(details.tabId), 10000);
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
        updateDetectedAccounts(currentUrlAccount);
      } else if (queryAccountMatch) {
        currentUrlAccount = String(queryAccountMatch[1]);
        console.log(`Detected account in query: ${currentUrlAccount}`);
        updateDetectedAccounts(currentUrlAccount);
      } else {
        console.log(`No account detected in URL path or query.`);
        // If no account is detected, it often defaults to 0 for Google services
        if (
          url.hostname.includes("google.com") &&
          !url.hostname.includes("accounts.google.com")
        ) {
          currentUrlAccount = "0";
          console.log(`Assuming account 0 for default Google service URL.`);
          updateDetectedAccounts("0"); // Also track the default account
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
        // Handle the specific Gmail URL pattern that appears when clicking the Gmail button in Chrome
        if (url.pathname === "/mail/" && url.search.includes("tab=rm")) {
          // Create a redirect URL with the preferred account but preserve other parameters
          const searchParams = new URLSearchParams(url.search);
          searchParams.set("authuser", authUser); // Replace with the preferred account
          redirectUrl = `https://mail.google.com/mail/?${searchParams.toString()}`;
          console.log(`Calculated Gmail button redirect URL: ${redirectUrl}`);
        } else {
          // Standard Gmail path handling
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

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle email found by content script
  if (message.action === 'foundEmail' && message.email) {
    console.log(`Content script found email: ${message.email}`);
    
    // Get the tab URL to extract account number
    const tabId = sender.tab.id;
    chrome.tabs.get(tabId, (tab) => {
      try {
        const url = new URL(tab.url);
        let accountNumber = null;
        const pathAccountMatch = url.pathname.match(/\/u\/(\d+)\//);
        const queryAccountMatch = url.search.match(/[?&]authuser=(\d+)/);
        
        if (pathAccountMatch) {
          accountNumber = String(pathAccountMatch[1]);
        } else if (queryAccountMatch) {
          accountNumber = String(queryAccountMatch[1]);
        } else if (url.hostname.includes('google.com')) {
          accountNumber = "0";
        }
        
        if (accountNumber !== null) {
          updateDetectedAccounts(accountNumber, message.email);
        }
      } catch (error) {
        console.error("Error extracting account info:", error);
      }
    });
  }
  
  // Handle account scan request from popup
  if (message.action === 'scanForAccounts') {
    scanForGoogleAccounts().then(result => {
      sendResponse(result);
    });
    return true; // Keep the message channel open for async response
  }
  
  return true;  // Keep the message channel open for async response
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

  // Initialize detectedAccounts to 1 (representing at least one account)
  // and create empty accountEmails object
  chrome.storage.local.set({ 
    detectedAccounts: 1,
    accountEmails: {}
  }, () => {
    console.log("Initialized detected accounts to 1 and created accountEmails storage");
});

  // Create dynamic rules for Gmail button URL
  createGmailButtonRule();

  // Display current storage contents
  chrome.storage.sync.get(null, (items) => {
    console.log("Current storage contents:", items);
  });
  chrome.storage.local.get(null, (items) => {
    console.log("Current local storage contents:", items);
  });
});

// Create a dynamic rule for the Gmail button URL
function createGmailButtonRule() {
  chrome.storage.sync.get("selectedAuthUser", (result) => {
    const authUser = result.selectedAuthUser !== undefined ? String(result.selectedAuthUser) : "0";
    
    // Create rules to redirect Gmail button clicks to the selected account
    const gmailButtonRules = [
      // Rule for URLs with tab=rm parameter
      {
        id: 10,
        priority: 2,
        action: {
          type: "redirect",
          redirect: {
            transform: {
              queryTransform: {
                addOrReplaceParams: [{ key: "authuser", value: authUser }]
              }
            }
          }
        },
        condition: {
          urlFilter: "https://mail.google.com/mail/?tab=rm",
          resourceTypes: ["main_frame"]
        }
      },
      // Rule for URLs with tab=rm and other parameters
      {
        id: 11,
        priority: 2,
        action: {
          type: "redirect",
          redirect: {
            transform: {
              queryTransform: {
                addOrReplaceParams: [{ key: "authuser", value: authUser }]
              }
            }
          }
        },
        condition: {
          urlFilter: "https://mail.google.com/mail/?tab=rm&",
          resourceTypes: ["main_frame"]
        }
      },
      // Rule for URLs with authuser=0 parameter
      {
        id: 12,
        priority: 2,
        action: {
          type: "redirect",
          redirect: {
            transform: {
              queryTransform: {
                addOrReplaceParams: [{ key: "authuser", value: authUser }]
              }
            }
          }
        },
        condition: {
          urlFilter: "https://mail.google.com/mail/?authuser=0",
          resourceTypes: ["main_frame"]
        }
      }
    ];
    
    // Update the rules
    chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [10, 11, 12], // Remove existing rules
      addRules: gmailButtonRules
    }).then(() => {
      console.log(`Created Gmail button rules for account ${authUser}`);
    }).catch(error => {
      console.error("Error creating Gmail button rules:", error);
    });
  });
}

// Listen for storage changes to update rules
chrome.storage.onChanged.addListener((changes, area) => {
  if (changes.selectedAuthUser) {
    const newValue = changes.selectedAuthUser.newValue;
    const oldValue = changes.selectedAuthUser.oldValue;
    console.log(
      `STORAGE CHANGED: selectedAuthUser from ${oldValue} to ${newValue}`
    );
    
    // Update the Gmail button rule when the selected account changes
    createGmailButtonRule();
  }
});

// Startup handler
chrome.runtime.onStartup.addListener(() => {
  console.log("Extension started");

  // Create Gmail button rule on startup
  createGmailButtonRule();

  // Display current storage contents on startup
  chrome.storage.sync.get(null, (items) => {
    console.log("Storage contents at startup:", items);
  });
  chrome.storage.local.get(null, (items) => {
    console.log("Local storage contents at startup:", items);
  });
});

// Function to scan Google accounts by visiting various urls with different authuser parameters
async function scanForGoogleAccounts() {
  console.log('Starting Google account scan');
  
  // First, check how many accounts we've detected so far
  const localStorageData = await new Promise(resolve => {
    chrome.storage.local.get(['detectedAccounts', 'accountEmails'], (result) => {
      resolve(result);
    });
  });
  
  const detectedAccounts = localStorageData.detectedAccounts || 1;
  const accountEmails = localStorageData.accountEmails || {};
  
  let foundAccounts = [];
  let tab = null;
  
  try {
    // Try multiple Google pages that show account info
    const urls = [
      'https://accounts.google.com/SignOutOptions',
      'https://myaccount.google.com',
      'https://mail.google.com'
    ];
    
    // Create a hidden tab for scanning
    tab = await new Promise(resolve => {
      chrome.tabs.create({ 
        url: urls[0], 
        active: false  // Keep it hidden
      }, (newTab) => {
        resolve(newTab);
      });
    });
    
    // Try each URL to find accounts
    for (const url of urls) {
      if (foundAccounts.length > 1) {
        // If we already found multiple accounts, stop searching
        break;
      }
      
      // Update the tab URL if it's not the first URL
      if (url !== urls[0]) {
        await new Promise(resolve => {
          chrome.tabs.update(tab.id, { url: url }, resolve);
        });
      }
      
      // Wait for the page to load
      await new Promise(resolve => setTimeout(resolve, 3000));
        
      console.log(`Scanning ${url}`);
        
        // Execute script to find accounts
        try {
          const results = await new Promise(resolve => {
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: () => {
                // This function runs in the context of the Google page
                const accounts = [];
                
                // Utility function to clean email text - only extract clean Gmail addresses
                const cleanEmail = (text) => {
                  if (!text) return null;
                  
                  // First, handle text that might have names with email in parens like: "John Smith (johnsmith@gmail.com)"
                  const parenthesesMatch = text.match(/\([\w.+-]+@gmail\.com\)/i);
                  if (parenthesesMatch) {
                    // Extract just the email from between parentheses
                    return parenthesesMatch[0].replace(/[\(\)]/g, '');
                  }
                  
                  // Extract a clean Gmail pattern from anywhere in the text
                  const gmailMatch = text.match(/[\w.+-]+@gmail\.com/i);
                  if (gmailMatch) {
                    return gmailMatch[0]; // Return only the matched Gmail portion
                  }
                  
                  // More lenient approach as last resort, but still only get the email part
                  if (text.toLowerCase().includes('@gmail.com')) {
                    // Find the @ position and work back to find a likely username
                    const atPosition = text.toLowerCase().indexOf('@gmail.com');
                    if (atPosition > 0) {
                      // Extract what's likely the username before @gmail.com
                      let startPos = atPosition;
                      while (startPos > 0 && /[\w.+-]/.test(text[startPos-1])) {
                        startPos--;
                      }
                      const username = text.substring(startPos, atPosition);
                      if (username) {
                        return username + '@gmail.com';
                      }
                    }
                  }
                  
                  return null;
                };
                
                // 1. Try to find accounts using data-email attribute (most reliable)
                const accountElements = document.querySelectorAll('div[data-email], li[data-email], a[data-email]');
                accountElements.forEach((el, index) => {
                  const email = el.getAttribute('data-email');
                  // Only accept Gmail addresses
                  if (email && email.toLowerCase().includes('@gmail.com')) {
                    accounts.push({
                      email: email,
                      accountNumber: index.toString()
                    });
                  }
                });
                
                // 2. Try Google account switcher UI classes (multiple versions)
                if (accounts.length <= 1) {
                  const selectors = [
                    // Account switcher classes
                    '.OVnw0d', '.NB6Ldc', '.RASpKe', '.hqHn1', '.gb_Tc',
                    // Individual profile item classes
                    '.gb_Ba', '.gb_Ea', '.gb_lb', '.gb_vb', '.gb_A'
                  ];
                  
                  for (const selector of selectors) {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach((el, index) => {
                      // Try to find email in the element text content or children
                      const allText = el.textContent || '';
                      const email = cleanEmail(allText);
                      
                      if (email && !accounts.some(a => a.email === email)) {
                        accounts.push({
                          email: email,
                          accountNumber: index.toString()
                        });
                      }
                    });
                  }
                }
                
                // 3. Look for specific selector combinations
                if (accounts.length <= 1) {
                  // Gmail-specific selectors
                  const profileElement = document.querySelector('.gb_A .gb_Fa, .gb_g .gb_Da, .gb_Jb');
                  if (profileElement) {
                    const email = cleanEmail(profileElement.textContent);
                    if (email && !accounts.some(a => a.email === email)) {
                      accounts.push({
                        email: email,
                        accountNumber: '0' // Default account is usually 0
                      });
                    }
                  }
                  
                  // Look for account menu items
                  document.querySelectorAll('[role="menuitem"]').forEach((menuItem, index) => {
                    if (menuItem.textContent && menuItem.textContent.includes('@')) {
                      const email = cleanEmail(menuItem.textContent);
                      if (email && !accounts.some(a => a.email === email)) {
                        accounts.push({
                          email: email,
                          accountNumber: index.toString()
                        });
                      }
                    }
                  });
                  
                  // All elements with aria-label containing @
                  document.querySelectorAll('[aria-label*="@"]').forEach((el, index) => {
                    const label = el.getAttribute('aria-label');
                    const email = cleanEmail(label);
                    if (email && !accounts.some(a => a.email === email)) {
                      accounts.push({
                        email: email,
                        accountNumber: index.toString()
                      });
                    }
                  });
                }
                
                // 4. If we still don't have multiple accounts, try all elements with @
                if (accounts.length <= 1) {
                  // Get all elements containing @
                  const allElements = Array.from(document.querySelectorAll('*')).filter(
                    el => el.textContent && el.textContent.includes('@')
                  );
                  
                  allElements.forEach((el, index) => {
                    const email = cleanEmail(el.textContent);
                    if (email && !accounts.some(a => a.email === email)) {
                      // Add with a high account number to avoid conflicts
                      accounts.push({
                        email: email,
                        accountNumber: (100 + index).toString()
                      });
                    }
                  });
                }
                
                // Remove duplicates (same email)
                const uniqueAccounts = [];
                const seenEmails = new Set();
                accounts.forEach(account => {
                  if (!seenEmails.has(account.email)) {
                    seenEmails.add(account.email);
                    uniqueAccounts.push(account);
                  }
                });
                
                console.log('Found accounts:', uniqueAccounts);
                return uniqueAccounts;
              }
            }, (results) => {
              if (chrome.runtime.lastError) {
                console.error('Script execution error:', chrome.runtime.lastError);
                resolve([]);
              } else {
                resolve(results);
              }
            });
          });
          
          // Process the results
          if (results && results[0] && results[0].result) {
            const newAccounts = results[0].result;
            console.log(`Found ${newAccounts.length} accounts at ${url}:`, newAccounts);
            
            // Merge with previously found accounts
            newAccounts.forEach(account => {
              if (!foundAccounts.some(a => a.email === account.email)) {
                foundAccounts.push(account);
              }
            });
          }
          
          if (foundAccounts.length > 1) {
            // If we found multiple accounts, we can stop trying
            break;
          }
        } catch (error) {
          console.error(`Error scanning accounts at ${url}:`, error);
      }
    }
    
    // Update storage with account information
    if (foundAccounts.length > 0) {
      console.log(`Total accounts found: ${foundAccounts.length}:`, foundAccounts);
      
      // Update detectedAccounts to the number of found accounts if higher
      const newDetectedAccounts = Math.max(detectedAccounts, foundAccounts.length);
      
      // Update accountEmails with the found email addresses
      const newAccountEmails = { ...accountEmails };
      
      // Normalize account numbers to be sequential from 0
      foundAccounts.forEach((account, index) => {
        newAccountEmails[index.toString()] = account.email;
      });
      
      // Save to storage
      await new Promise(resolve => {
        chrome.storage.local.set({
          detectedAccounts: newDetectedAccounts,
          accountEmails: newAccountEmails
        }, resolve);
      });
      
      console.log('Updated account information in storage:', newAccountEmails);
    } else {
      console.log('No accounts found or unable to detect them');
    }
  } catch (error) {
    console.error('Error in account scanning process:', error);
  } finally {
    // Clean up by closing the hidden tab
    if (tab) {
      chrome.tabs.remove(tab.id);
    }
  }
  
  return { success: true, accountsFound: foundAccounts.length };
}
