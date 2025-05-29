document.addEventListener("DOMContentLoaded", () => {
  const picker = document.getElementById("accountPicker");
  const saveButton = document.getElementById("save");
  const refreshButton = document.getElementById("refresh");
  const feedback = document.getElementById("feedback");
  const themeToggle = document.getElementById("theme-toggle");

  // Only Gmail service toggle remains
  const serviceToggles = {
    gmail: document.getElementById("gmail"),
  };

  // No debug section needed anymore
  
  // Function to populate the account picker based on detected accounts
  function populateAccountPicker(numberOfAccounts, accountEmails = {}) {
    // Clear existing options
    picker.innerHTML = "";
    
    // Add options based on the number of detected accounts
    for (let i = 0; i < numberOfAccounts; i++) {
      const option = document.createElement("option");
      option.value = i.toString();
      
      // Use email if available, otherwise fallback to account number
      let email = accountEmails[i];
      
      if (email) {
        // Ensure we're displaying ONLY the email address - clean any names or extra text
        email = cleanEmailAddress(email);
        option.textContent = email;
      } else {
        option.textContent = `Account ${i + 1}`;
      }
      
      picker.appendChild(option);
    }
  }
  
  // Helper function to clean email addresses - ensure only pure gmail.com addresses display
  function cleanEmailAddress(input) {
    if (!input) return '';
    
    // Extract clean Gmail address with no extra text
    const gmailPattern = /([\w.+-]+@gmail\.com)/i;
    const match = input.match(gmailPattern);
    
    if (match && match[1]) {
      return match[1].toLowerCase();
    }
    
    // If no Gmail pattern found, just return the input with basic cleaning
    // Remove any name parts before email (John Doe <email> format)
    const cleanedInput = input.replace(/.*<(.+@.+)>.*/, '$1');
    return cleanedInput.toLowerCase().trim();
  }

  // Simple function to log storage info but not display it
  function logStorageInfo() {
    chrome.storage.sync.get(
      ["selectedAuthUser", "enabledServices"],
      (syncResult) => {
        chrome.storage.local.get(["detectedAccounts", "accountEmails"], (localResult) => {
          console.log("Storage Info:", {
            selectedAuthUser: syncResult.selectedAuthUser,
            enabledServices: syncResult.enabledServices,
            detectedAccounts: localResult.detectedAccounts || 1,
            accountEmails: localResult.accountEmails || {}
          });
        });
      }
    );
  }

  // Load saved settings and detected accounts
  chrome.storage.local.get(["detectedAccounts", "accountEmails"], (localResult) => {
    const numberOfAccounts = localResult.detectedAccounts || 1; // Default to 1 if not set
    const accountEmails = localResult.accountEmails || {};
    
    // Populate the account picker dropdown with emails
    populateAccountPicker(numberOfAccounts, accountEmails);
    // Add refresh button handler
    refreshButton.addEventListener("click", refreshAccountList);
    
    // Then load sync settings
    chrome.storage.sync.get(
      ["selectedAuthUser", "enabledServices"],
      ({ selectedAuthUser, enabledServices }) => {
        // Set selected account
        if (selectedAuthUser !== undefined) {
          // Check if the selected account is still valid (within range)
          if (parseInt(selectedAuthUser) < numberOfAccounts) {
            picker.value = selectedAuthUser;
          } else {
            // If selected account is out of range, reset to account 0
            chrome.storage.sync.set({ selectedAuthUser: "0" });
          }
        }

        // Set service toggle states - Gmail is always enabled
        serviceToggles.gmail.checked = true;

        updateDebugInfo();
      }
    );
  });

  // Initialize theme based on system preference or stored preference
  function initializeTheme() {
    chrome.storage.local.get(['darkMode'], (result) => {
      // If we have a stored preference, use it
      if (result.darkMode !== undefined) {
        setTheme(result.darkMode);
      } else {
        // Otherwise use system preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setTheme(prefersDark);
      }
    });
  }
  
  // Set theme (dark or light)
  function setTheme(isDark) {
    // Apply theme to HTML element
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    
    // No need to change textContent - CSS handles the icons based on data-theme
    themeToggle.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    
    // Store preference
    chrome.storage.local.set({ darkMode: isDark });
  }
  
  // Toggle theme when button is clicked
  themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    setTheme(!isDark);
  });
  
  initializeTheme();
  
  // Helper function to show feedback messages
  function showFeedback(message) {
    feedback.textContent = message;
    feedback.style.display = 'block';
    
    // Hide after 2 seconds
    setTimeout(() => {
      feedback.style.display = 'none';
    }, 2000);
  }

  // Initialize manual switching mode
  const manualModeToggle = document.getElementById('manualMode');
  if (manualModeToggle) {
    // Load manual mode setting
    chrome.storage.local.get(['manualMode'], (result) => {
      manualModeToggle.checked = !!result.manualMode;
    });
    
    // Save manual mode setting when changed
    manualModeToggle.addEventListener('change', () => {
      chrome.storage.local.set({ manualMode: manualModeToggle.checked });
      
      // Show appropriate feedback message
      showFeedback(manualModeToggle.checked ? 
        'Manual switching enabled!' : 
        'Automatic redirection restored!');
    });
  }

  // Modal logic for refresh confirmation
  const refreshModal = document.getElementById('refreshModal');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const modalCancelBtn = document.getElementById('modalCancelBtn');
  const modalConfirmBtn = document.getElementById('modalConfirmBtn');

  function showRefreshModal() {
    refreshModal.style.display = 'flex';
  }
  function hideRefreshModal() {
    refreshModal.style.display = 'none';
  }
  modalCloseBtn.onclick = hideRefreshModal;
  modalCancelBtn.onclick = hideRefreshModal;

  // Function to refresh the account list
  function refreshAccountList() {
    showRefreshModal();
  }

  // When user confirms in modal, start the scan
  modalConfirmBtn.onclick = function() {
    hideRefreshModal();
    // Show loading indicator in the refresh button
    refreshButton.innerHTML = "<div class='loading-spinner'></div>";
    refreshButton.disabled = true;
    
    // Show initial notification
    feedback.textContent = "Scanning for accounts in background...";
    feedback.style.display = "block";
    
    // Send message to background script to scan for accounts
    chrome.runtime.sendMessage({ action: 'scanForAccounts' }, response => {
      // Reload the account list
      chrome.storage.local.get(["detectedAccounts", "accountEmails"], (localResult) => {
        const numberOfAccounts = localResult.detectedAccounts || 1;
        const accountEmails = localResult.accountEmails || {};
        
        // Update the dropdown
        populateAccountPicker(numberOfAccounts, accountEmails);
        
        // Show success message
        feedback.textContent = "Account list refreshed!";
        feedback.style.display = "block";
        
        // Reset the refresh button
        refreshButton.innerHTML = "↻";
        refreshButton.disabled = false;
        
        // Hide feedback after 4 seconds
        setTimeout(() => {
          feedback.style.display = "none";
        }, 4000);
        
        // Log storage info
        logStorageInfo();
      });
    });
  };

  // Save button click handler
  saveButton.addEventListener("click", () => {
    // Convert to string explicitly and store the original value for logging
    const originalValue = picker.value;
    const selected = String(originalValue); // Ensure it's a string
    console.log(
      "Saving account selection:",
      selected,
      `(original type: ${typeof originalValue})`
    );

    // Collect enabled services - Gmail is the only service and it's always enabled
    const enabledServices = {
      gmail: true,
    };

    // Force a clear of the storage before setting new values
    chrome.storage.sync.clear(() => {
      // Save settings to storage
      chrome.storage.sync.set(
        {
          selectedAuthUser: selected, // Explicitly a string now
          enabledServices: enabledServices,
        },
        () => {
          console.log("Settings saved:", {
            selectedAuthUser: selected,
            enabledServices,
          });

          logStorageInfo();

          // Show feedback message
          feedback.style.display = "block";

          // Hide feedback after 2 seconds
          setTimeout(() => {
            feedback.style.display = "none";
            // Keep the popup open instead of closing it
          }, 2000);
        }
      );
    });
  });

  // About Section Toggle
  const aboutSectionMinimal = document.querySelector('.about-section-minimal');
  const aboutSectionDetails = document.querySelector('.about-section-details');

  aboutSectionMinimal.addEventListener('click', () => {
    aboutSectionDetails.classList.toggle('show');
  });
});
