const response = await fetch("/api/lab/visit", { method: "POST" });
const { showModal } = await response.json();
if (showModal) {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "announcement-title");
  dialog.innerHTML =
    '<h2 id="announcement-title">Welcome to the new forecast</h2><p>Your forecast tools are ready. Dismiss this announcement to continue.</p><form method="dialog"><button>Got it</button></form>';
  document.body.append(dialog);
  dialog.showModal();
}
