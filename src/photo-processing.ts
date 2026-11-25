import "./admin-loading.css";

/** Keeps the active photo editor visible behind a blocking status while the operation runs. */
export async function withPhotoProcessing<T>(message: string, operation: (setMessage: (value: string) => void) => Promise<T>): Promise<T> {
  const dialog = document.createElement("dialog");
  dialog.className = "photo-processing";
  dialog.setAttribute("aria-label", "Processing photo");
  const status = document.createElement("p");
  status.className = "admin-loading";
  status.setAttribute("role", "status");
  status.textContent = message;
  dialog.append(status);
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
