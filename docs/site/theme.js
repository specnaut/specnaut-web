// Footer dark / light theme toggle, shared by the landing and every generated
// page. Default follows the OS; clicking forces a theme (persisted) by setting
// [data-theme] on <html>, which the stylesheet honours over the
// prefers-color-scheme media query. The pre-paint snippet that applies the
// saved theme stays inline in each <head>: loaded from here it would run after
// first paint and flash the wrong theme.

/** The icon the toggle shows, keyed by the current theme: it advertises the other one. */
const THEME_TOGGLE_ICONS = {
  dark:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>',
  light:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
};

const themeMql = globalThis.matchMedia("(prefers-color-scheme: dark)");

/** The theme in force: the forced one, else the OS preference. */
const effectiveTheme = () =>
  document.documentElement.dataset.theme || (themeMql.matches ? "dark" : "light");

(() => {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  const iconEl = btn.querySelector(".theme-toggle-icon");
  const labelEl = btn.querySelector(".theme-toggle-label");
  const render = () => {
    const theme = effectiveTheme();
    iconEl.innerHTML = THEME_TOGGLE_ICONS[theme];
    labelEl.textContent = theme === "dark" ? "Light" : "Dark";
  };
  render();
  btn.addEventListener("click", () => {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch (err) {
      // Storage blocked (private mode, a policy): the theme still applies to
      // this page view, it just does not persist.
      console.warn("theme: not persisted", err);
    }
    render();
  });
  themeMql.addEventListener("change", render);
})();
