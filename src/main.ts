import "./retro.css";
import "./app.css";
import { mountCalculator } from "./ui/calculator";

mountCalculator();
registerServiceWorker();
syncThemeColor();

/** Register the offline app-shell worker (production builds only). */
function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support is a bonus; never let it break the app.
    });
  });
}

/** Keep the mobile status-bar colour in step with the selected CRT theme. */
function syncThemeColor(): void {
  document.addEventListener("retro:theme", (event) => {
    const palette = (event as CustomEvent<{ bg?: string }>).detail;
    if (!palette?.bg) {
      return;
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", palette.bg);
  });
}
