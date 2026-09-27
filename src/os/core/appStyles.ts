// An app's own stylesheet arrives with its code, not with the page. Astro
// would hoist a stylesheet imported anywhere in the island into the first
// load, so apps' styles are imported as text (`?inline`) by their
// manifests and adopted here when the app is first loaded. Adopted sheets
// come after the page's own in the cascade, so an app's rules have the
// last word on its classes, as os.css explains.

const adopted = new Set<string>();

/** Adds an app's stylesheet to the page, once. */
export function adoptStyles(app: string, css: string) {
  if (adopted.has(app) || typeof document === 'undefined') return;
  adopted.add(app);
  if ('adoptedStyleSheets' in document && 'replaceSync' in CSSStyleSheet.prototype) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    return;
  }
  const style = document.createElement('style');
  style.dataset.app = app;
  style.textContent = css;
  document.head.append(style);
}
