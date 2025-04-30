document.addEventListener("DOMContentLoaded", () => {
  const picker = document.getElementById("accountPicker");
  const saveButton = document.getElementById("save");
  const feedback = document.getElementById("feedback");

  // DIAGNOSTIC: Add a debug section to the popup
  const debugDiv = document.createElement("div");
  debugDiv.style.marginTop = "20px";
  debugDiv.style.padding = "10px";
  debugDiv.style.backgroundColor = "#f0f0f0";
  debugDiv.style.borderRadius = "4px";
  debugDiv.style.fontSize = "12px";
  debugDiv.innerHTML = "<strong>Debug Info:</strong><br>Loading...";
  document.body.appendChild(debugDiv);

  function updateDebugInfo() {
    chrome.storage.sync.get(
      ["selectedAuthUser", "enabledServices"],
      (result) => {
        debugDiv.innerHTML = `
        <strong>Debug Info:</strong><br>
        selectedAuthUser: "${
          result.selectedAuthUser
        }" (${typeof result.selectedAuthUser})<br>
        enabledServices: ${JSON.stringify(result.enabledServices)}<br>
        <button id="checkStorage">Check Storage</button>
      `;

        document
          .getElementById("checkStorage")
          .addEventListener("click", updateDebugInfo);
      }
    );
  }

  // Service toggle checkboxes
  const serviceToggles = {
    gmail: document.getElementById("gmail"),
    drive: document.getElementById("drive"),
    calendar: document.getElementById("calendar"),
    docs: document.getElementById("docs"),
  };

  // Load saved settings
  chrome.storage.sync.get(
    ["selectedAuthUser", "enabledServices"],
    ({ selectedAuthUser, enabledServices }) => {
      console.log("Popup loaded with settings:", {
        selectedAuthUser,
        enabledServices,
      });

      // Set selected account
      if (selectedAuthUser !== undefined) {
        picker.value = selectedAuthUser;
      }

      // Set service toggle states
      if (enabledServices) {
        for (const [service, enabled] of Object.entries(enabledServices)) {
          if (serviceToggles[service]) {
            serviceToggles[service].checked = enabled;
          }
        }
      }

      updateDebugInfo();
    }
  );

  // Save button click handler
  saveButton.addEventListener("click", () => {
    const selected = picker.value;
    console.log("Saving account selection:", selected);

    // Collect enabled services
    const enabledServices = {
      gmail: serviceToggles.gmail.checked,
      drive: serviceToggles.drive.checked,
      calendar: serviceToggles.calendar.checked,
      docs: serviceToggles.docs.checked,
    };

    // Force a clear of the storage before setting new values
    chrome.storage.sync.clear(() => {
      // Save settings to storage
      chrome.storage.sync.set(
        {
          selectedAuthUser: selected.toString(), // Ensure it's a string
          enabledServices: enabledServices,
        },
        () => {
          console.log("Settings saved:", {
            selectedAuthUser: selected.toString(),
            enabledServices,
          });

          updateDebugInfo();

          // Show feedback message
          feedback.style.display = "block";

          // Hide feedback after 2 seconds
          setTimeout(() => {
            feedback.style.display = "none";
            // Don't close the popup automatically so user can see debug info
            // window.close();
          }, 2000);
        }
      );
    });
  });

  // Service toggle handlers
  for (const checkbox of Object.values(serviceToggles)) {
    checkbox.addEventListener("change", () => {
      // Collect current services state
      const enabledServices = {
        gmail: serviceToggles.gmail.checked,
        drive: serviceToggles.drive.checked,
        calendar: serviceToggles.calendar.checked,
        docs: serviceToggles.docs.checked,
      };

      // Save service settings immediately
      chrome.storage.sync.set({ enabledServices });
    });
  }
});
