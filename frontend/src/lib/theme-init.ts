export const THEME_KEY = "theme";

/**
 * Runs in <head> before first paint so the page never flashes the wrong theme: an explicit choice wins,
 * otherwise the device setting.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}})();`;

