document.addEventListener("DOMContentLoaded", () => {
    const picker = document.getElementById("accountPicker");
    const saveButton = document.getElementById("save");
  
    // Load saved authUser
    chrome.storage.sync.get("selectedAuthUser", ({ selectedAuthUser }) => {
      if (selectedAuthUser) {
        picker.value = selectedAuthUser;
      }
    });
  
    saveButton.addEventListener("click", () => {
      const selected = picker.value;
      chrome.storage.sync.set({ selectedAuthUser: selected }, () => {
        console.log("Default Google account set to authuser =", selected);
        window.close(); // Close the popup
      });
    });
  });
  