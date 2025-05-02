document.addEventListener("DOMContentLoaded", () => {
  const picker = document.getElementById("accountPicker");
  const saveButton = document.getElementById("save");
  const feedback = document.getElementById("feedback");

  // Only Gmail service toggle remains
  const serviceToggles = {
    gmail: document.getElementById("gmail"),
  };

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

      // Set service toggle states - Gmail is always enabled
      serviceToggles.gmail.checked = true;

      updateDebugInfo();
    }
  );

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

          updateDebugInfo();

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
});
