// The landing's own interactions: the copy buttons (both install snippets and
// the agent prompt) and the lede's harness rotator. Loaded only by
// docs/site/index.html, deferred, like theme.js.

const ICON_COPY =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="13" height="13" x="9" y="9" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const ICON_CHECK =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

/** What a copy shows on its button and says in the live region, and for how long. */
const COPIED = { label: "Copied", icon: ICON_CHECK, status: "Copied to the clipboard.", ms: 1500 };
const COPY_FAILED = {
  label: "Copy failed — text selected",
  icon: ICON_COPY,
  status: "Copy failed. The text is selected: copy it from the keyboard or the menu.",
  ms: 2500,
};

// A button's changed label is not read out on its own: the outcome also goes
// to this polite live region, so a screen reader hears it.
const copyStatus = document.getElementById("copy-status");

// The copy buttons only work with this script, so it draws their icon:
// ICON_COPY is then the icon's one spelling, not a copy of the markup per button.
for (const icon of document.querySelectorAll("[data-copy-target] .btn-icon")) {
  icon.innerHTML = ICON_COPY;
}

/**
 * Each button's one pending reset. A new outcome cancels it before starting its
 * own: left running, the first click's timer would cut the second one short.
 */
const pendingReset = new WeakMap();

/** Shows `outcome` on `btn` and in the live region, then gives the button its own label back. */
function showOutcome(btn, outcome) {
  const label = btn.querySelector(".btn-label");
  const icon = btn.querySelector(".btn-icon");
  // Kept from the first click: a second click lands while the label says "Copied".
  if (label) label.dataset.label ??= label.textContent;
  if (label) label.textContent = outcome.label;
  if (icon) icon.innerHTML = outcome.icon;
  announce(outcome.status);
  clearTimeout(pendingReset.get(btn));
  pendingReset.set(
    btn,
    setTimeout(() => {
      if (label) label.textContent = label.dataset.label;
      if (icon) icon.innerHTML = ICON_COPY;
      if (copyStatus) copyStatus.textContent = "";
    }, outcome.ms),
  );
}

/**
 * Puts `status` in the live region. A screen reader announces a change, so the
 * region is cleared first and set on the next frame: the same outcome twice in
 * a row is then two changes, and is heard twice.
 */
function announce(status) {
  if (!copyStatus) return;
  copyStatus.textContent = "";
  requestAnimationFrame(() => {
    copyStatus.textContent = status;
  });
}

/**
 * Writes `text` to the clipboard. Where the Clipboard API is missing (a page
 * served over plain HTTP, a browser or webview without it) the call throws
 * before any promise exists; that is turned into a rejection, so it ends in the
 * same copy-failed outcome as a refused write. Called within the click, never
 * deferred, so the browser still counts it as the user's gesture.
 */
function writeClipboard(text) {
  try {
    return navigator.clipboard.writeText(text);
  } catch (err) {
    return Promise.reject(err);
  }
}

// Delegated, so one handler covers every [data-copy-target] button.
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-copy-target]");
  const target = btn && document.getElementById(btn.dataset.copyTarget);
  if (!target) return;
  writeClipboard(target.innerText.trim()).then(
    () => showOutcome(btn, COPIED),
    (err) => {
      console.warn("copy: clipboard write failed", err);
      // The outcome says the text is selected: the visitor copies it by hand.
      globalThis.getSelection().selectAllChildren(target);
      showOutcome(btn, COPY_FAILED);
    },
  );
});

// Lede harness rotator. Cycles through the supported harness display
// names every 2s with a fade transition. Static fallback for reduced-motion.
(() => {
  const rotator = document.querySelector(".harness-rotator");
  if (!rotator) return;
  const harnesses = [
    "Claude Code",
    "Cursor",
    "Codex CLI",
    "GitHub Copilot CLI",
    "OpenCode",
    "Antigravity",
  ];
  if (globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    rotator.textContent = "your AI coding harness";
    return;
  }
  let i = 0;
  setInterval(() => {
    rotator.classList.add("is-fading");
    setTimeout(() => {
      i = (i + 1) % harnesses.length;
      rotator.textContent = harnesses[i];
      rotator.classList.remove("is-fading");
    }, 350);
  }, 2000);
})();
