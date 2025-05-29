// In popup.js, replace the refreshAccountList function's loading indicator:
function refreshAccountList() {
  // Show loading indicator
  refreshButton.innerHTML = "<div class='loading-spinner'></div>";
  refreshButton.disabled = true;
  
  // Rest of your refresh logic...
}// Content script to help extract email addresses from Google pages

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getEmail') {
    const email = findEmailInPage();
    sendResponse({ email: email });
  }
  return true; // Keep the message channel open for async response
});

// Attempt to find email in page
function findEmailInPage() {
  // Try multiple known Google account email selectors
  const possibleSelectors = [
    '.gb_Bb', '.gb_Ad', '.gb_A', '.gb_C', '.gb_Da', // Older selectors
    'div[data-email]', // Some elements have data-email attribute
    '.gb_1b', '.gb_2b', '.gb_d', // Newer selectors
    // Profile menu elements
    'a[aria-label*="@"]',
    'div[aria-label*="@"]',
    // More generic - look for elements containing @ symbol in profile areas
    '.gb_mb', '.gb_lb', '.gb_kb'
  ];
  
  // Try each selector
  for (const selector of possibleSelectors) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      // Check if the text content looks like an email
      const text = el.textContent || '';
      if (text.includes('@')) {
        return text.trim();
      }
      
      // Check for data-email attribute
      if (el.getAttribute('data-email')) {
        return el.getAttribute('data-email');
      }
      
      // Check aria-label for email
      if (el.getAttribute('aria-label') && el.getAttribute('aria-label').includes('@')) {
        return el.getAttribute('aria-label').trim();
      }
    }
  }
  
  // If we haven't found an email, try to check all elements that might contain emails
  const allElements = document.querySelectorAll('*');
  for (const el of allElements) {
    const text = el.textContent || '';
    if (text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) && text.length < 50) {
      // This looks like an email address and isn't too long (to avoid false positives)
      return text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)[0];
    }
  }
  
  return null;
}

// Send email to background script when found (after page load)
document.addEventListener('DOMContentLoaded', () => {
  // Wait a bit for Google to fully load account info
  setTimeout(() => {
    const email = findEmailInPage();
    if (email) {
      chrome.runtime.sendMessage({ action: 'foundEmail', email: email });
    }
  }, 2000);
});

// Also try when DOM mutations occur (for dynamically loaded content)
const observer = new MutationObserver(() => {
  const email = findEmailInPage();
  if (email) {
    chrome.runtime.sendMessage({ action: 'foundEmail', email: email });
    // Don't need to keep observing if we found the email
    observer.disconnect();
  }
});

// Start observing the document with the configured parameters
observer.observe(document.body, { childList: true, subtree: true });
