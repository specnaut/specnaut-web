// Footer dark / light theme toggle, shared by the landing and every generated
// page. Default follows the OS; clicking forces a theme (persisted) by setting
// [data-theme] on <html>, which the stylesheet honours over the
// prefers-color-scheme media query. The pre-paint snippet that applies the
// saved theme stays inline in each <head>: loaded from here it would run after
// first paint and flash the wrong theme.
(() => {
  const root = document.documentElement;
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  const mql = globalThis.matchMedia("(prefers-color-scheme: dark)");
  const iconEl = btn.querySelector(".theme-toggle-icon");
  const labelEl = btn.querySelector(".theme-toggle-label");
  const ICON_SUN =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
  const ICON_MOON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
  const effective = () => root.dataset.theme || (mql.matches ? "dark" : "light");
  const render = () => {
    // The control advertises the theme it will switch *to*.
    if (effective() === "dark") {
      iconEl.innerHTML = ICON_SUN;
      labelEl.textContent = "Light";
    } else {
      iconEl.innerHTML = ICON_MOON;
      labelEl.textContent = "Dark";
    }
  };
  render();
  btn.addEventListener("click", () => {
    const next = effective() === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch (err) {
      // Storage blocked (private mode, a policy): the theme still applies to
      // this page view, it just does not persist.
      console.warn("theme: not persisted", err);
    }
    render();
  });
  mql.addEventListener("change", render);
})();
