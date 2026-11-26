import "./admin-loading.css";

/** Keeps the active photo editor visible behind a blocking status while the operation runs. */
export async function withPhotoProcessing<T>(message: string, operation: (setMessage: (value: string) => void) => Promise<T>,
  actions: { label: string; run: () => Promise<boolean> }[] = []): Promise<T> {
  const dialog = document.createElement("dialog");
  dialog.className = "photo-processing";
  dialog.setAttribute("aria-label", "Processing photo");
  const status = document.createElement("p");
  status.className = "admin-loading";
  status.setAttribute("role", "status");
  status.textContent = message;
  dialog.append(status);
  for (const action of actions) {
    const button = document.createElement("button"), error = document.createElement("p");
    button.type = "button"; button.textContent = action.label;
    error.setAttribute("role", "alert"); error.hidden = true;
    button.addEventListener("click", async () => {
      button.disabled = true; error.hidden = true;
      try { button.disabled = await action.run(); }
      catch (reason) { error.textContent = reason instanceof Error ? reason.message : String(reason); error.hidden = false; button.disabled = false; }
    });
    dialog.append(button, error);
  }
  dialog.addEventListener("cancel", event => event.preventDefault());
  document.body.append(dialog);
  try {
    dialog.showModal();
    // Let the overlay paint before canvas work. The timer also works in a background tab.
    await new Promise<void>(resolve => {
      const timer = window.setTimeout(resolve, 120);
      requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timer); resolve(); }));
    });
    return await operation(value => { status.textContent = value; });
  } finally {
    dialog.close();
    dialog.remove();
  }
}
