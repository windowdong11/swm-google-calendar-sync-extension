const DEFAULT_SETTINGS = {
  backToBackMinutes: 15,
  allowDirectDelete: false,
  confirmBeforeDelete: true,
  includeTransparentEvents: false,
  selectedCalendarIds: ["primary"]
};

const backToBackMinutes = document.getElementById("backToBackMinutes");
const allowDirectDelete = document.getElementById("allowDirectDelete");
const confirmBeforeDelete = document.getElementById("confirmBeforeDelete");
const includeTransparentEvents = document.getElementById("includeTransparentEvents");
const saveBtn = document.getElementById("saveBtn");
const status = document.getElementById("status");
const extensionId = document.getElementById("extensionId");

async function load() {
  const result = await chrome.storage.sync.get("userSettings");
  const settings = { ...DEFAULT_SETTINGS, ...(result.userSettings || {}) };

  backToBackMinutes.value = String(settings.backToBackMinutes);
  allowDirectDelete.checked = settings.allowDirectDelete;
  confirmBeforeDelete.checked = settings.confirmBeforeDelete;
  includeTransparentEvents.checked = settings.includeTransparentEvents;
  extensionId.textContent = chrome.runtime.id;
}

async function save() {
  const value = Number(backToBackMinutes.value || 15);
  const settings = {
    backToBackMinutes: Math.min(120, Math.max(0, value)),
    allowDirectDelete: allowDirectDelete.checked,
    confirmBeforeDelete: confirmBeforeDelete.checked,
    includeTransparentEvents: includeTransparentEvents.checked,
    selectedCalendarIds: ["primary"]
  };

  await chrome.storage.sync.set({ userSettings: settings });
  status.textContent = "저장되었습니다.";
  setTimeout(() => {
    status.textContent = "";
  }, 1500);
}

saveBtn.addEventListener("click", save);
load();
