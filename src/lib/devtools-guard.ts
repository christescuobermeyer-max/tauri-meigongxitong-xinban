export function installDevtoolsGuard() {
  if (typeof window === "undefined") return;

  window.addEventListener("contextmenu", blockEvent, { capture: true });
  window.addEventListener("keydown", blockDevtoolsShortcut, { capture: true });
}

function blockDevtoolsShortcut(event: KeyboardEvent) {
  const key = event.key.toUpperCase();
  const isCtrlOrMeta = event.ctrlKey || event.metaKey;
  const isMacInspectShortcut = event.metaKey && event.altKey && ["I", "J", "C"].includes(key);
  const isInspectShortcut =
    event.key === "F12" ||
    (isCtrlOrMeta && event.shiftKey && ["I", "J", "C"].includes(key)) ||
    isMacInspectShortcut ||
    (isCtrlOrMeta && key === "U");

  if (isInspectShortcut) blockEvent(event);
}

function blockEvent(event: Event) {
  event.preventDefault();
  event.stopPropagation();
}
