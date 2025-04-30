# Google Account Extension - Documentation

## Project Overview

This extension allows users to redirect Google services (Calendar, Mail, Drive, Docs) to a specific account number, avoiding the need to manually switch between Google accounts.

## Current Implementation

### Files Structure

- **manifest.json** - Extension configuration and permissions
- **background.js** - Background service worker for rule management
- **popup.html** - User interface for account selection
- **popup.js** - UI interaction logic
- **icon.png** - Extension icon
- **rules.json** - Declarative network request rules

### Implemented Features

- Account selection storage using Chrome Storage API
- Dynamic rule creation for various Google services
- Automatic redirection based on selected account
- Service worker background script for handling rules
- Support for four Google services (Calendar, Gmail, Drive, Docs)
- User interface for selecting preferred account

### Technical Implementation

#### 1. Background Service Worker (background.js)

- Manages declarativeNetRequest rules dynamically
- Listens for account selection changes
- Updates redirect rules when the selected account changes
- Maintains consistency across browser sessions

```javascript
// Key functionality
function updateRedirectRules(authUser) {
  // Remove existing redirect rules
  chrome.declarativeNetRequest
    .updateSessionRules({
      removeRuleIds: [1, 2, 3, 4],
    })
    .then(() => {
      // Add new redirect rules
      const rules = [];
      let ruleId = 1;

      for (const [hostname, servicePath] of Object.entries(services)) {
        rules.push({
          id: ruleId++,
          priority: 1,
          action: {
            type: "redirect",
            redirect: {
              transform: {
                host: hostname,
                path: `${servicePath}/u/${authUser}/`,
              },
            },
          },
          condition: {
            urlFilter: `*://${hostname}${servicePath}/*`,
            excludeUrlFilter: `*://${hostname}${servicePath}/u/*`,
            resourceTypes: ["main_frame"],
          },
        });
      }

      return chrome.declarativeNetRequest.updateSessionRules({
        addRules: rules,
      });
    });
}
```

#### 2. User Interface (popup.html, popup.js)

- Simple dropdown interface for account selection
- Saves user preference to Chrome Storage
- Displays embedded iframe showing Google accounts (read-only)

#### 3. Manifest Configuration

- Using Manifest V3
- Required permissions: declarativeNetRequest, storage
- Host permissions for Google domains
- Configured with declarative_net_request rule resources

## Planned Features & Improvements

### Short-term Improvements

1. **Better Account Management**

   - [ ] Auto-detect signed-in accounts instead of hardcoded options
   - [ ] Show account profile pictures and names
   - [ ] Remove iframe which may not work due to CSP restrictions

2. **Additional Services**

   - [ ] Add support for YouTube
   - [ ] Add support for Google Photos
   - [ ] Add support for Google Meet
   - [ ] Add support for Google Maps

3. **UX Improvements**
   - [ ] Add feedback when account is changed
   - [ ] Add option to toggle services on/off
   - [ ] Add keyboard shortcuts

### Long-term Roadmap

1. **Performance Optimizations**

   - [ ] Batch rule updates to reduce API calls
   - [ ] Add error recovery logic

2. **Advanced Features**

   - [ ] Per-service account preferences
   - [ ] Scheduled account switching
   - [ ] Rules for specific URL patterns
   - [ ] Context menu options

3. **General Improvements**
   - [ ] Add options page for advanced settings
   - [ ] Add better error handling and logging
   - [ ] Create welcome/onboarding page

## Known Issues

- The iframe for showing Google accounts may be blocked by CSP
- Rules are recreated on each change rather than updated selectively
- Limited to 4 hardcoded services
- No error handling for failed redirects

## Testing Checklist

- [ ] Test rule application when switching between accounts
- [ ] Test behavior on Google service startup pages
- [ ] Verify rule cleanup on extension uninstall
- [ ] Test with multiple signed-in Google accounts
- [ ] Test across browser sessions/restarts

## API Reference

### Chrome Storage API

```javascript
// Save data
chrome.storage.sync.set({ selectedAuthUser: value });

// Retrieve data
chrome.storage.sync.get("selectedAuthUser", ({ selectedAuthUser }) => {
  // Use selectedAuthUser value
});

// Listen for changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.selectedAuthUser) {
    const newValue = changes.selectedAuthUser.newValue;
    // Handle new value
  }
});
```

### declarativeNetRequest API

```javascript
// Update session rules
chrome.declarativeNetRequest.updateSessionRules({
  removeRuleIds: [idList],
  addRules: [ruleObjects],
});

// Rule structure
const rule = {
  id: number,
  priority: number,
  action: {
    type: "redirect",
    redirect: { transform: { host: string, path: string } },
  },
  condition: {
    urlFilter: string,
    excludeUrlFilter: string,
    resourceTypes: [string],
  },
};
```

## Development Notes

- Last Updated: April 30, 2025
- Current Version: 1.0
- Manifest Version: 3
- Chrome API Version: Current as of last update

This documentation serves as a living document and should be updated as the extension evolves.
