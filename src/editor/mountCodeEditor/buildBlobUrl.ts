/**
 * Builds a blob: URL for the Monaco iframe HTML to work around CSP restrictions in Obsidian.
 *
 * Why: Obsidian blocks external scripts, styles, and data: fonts in child frames,
 * and prevents loading local HTML files directly via file:// or srcdoc.
 *
 * How:
 *   1. Fetch the HTML, inject a <base href> for loader.js.
 *   2. Fetch all assets in parallel (CSS, Prettier plugins, formatters, bundle.js).
 *   3. Inline Monaco CSS as <style> and patch the codicon @font-face to use an app:// URL.
 *   4. Monkey-patch appendChild to silently drop <link rel="stylesheet"> nodes Monaco injects at runtime.
 *   5. Encode each script as base64 and inject via (0,eval)(atob(...)) to avoid HTML parser issues.
 *   6. Inject WASM URLs as globals before each formatter script (clang, ruff, gofmt).
 *   7. Duplicate parseEditorConfig inline — the iframe context cannot import from settingsUtils.ts.
 *   8. Wrap the result in a Blob and return a blob: URL, cached for the plugin session.
 */

import type { AssetUrls } from '../../types/index.ts';

// Module-level cache — valid for the lifetime of the plugin session
let _cachedBlobUrl: string | null = null;
let _cachedUrlsKey: string | null = null;

/**
 * Fetches the Monaco iframe HTML, injects a <base href> for the single remaining external script (loader.js),
 * inlines Monaco CSS (blocked by Obsidian's CSP via <link> in child frames),
 * patches the codicon @font-face src (data: fonts are blocked in child frames),
 * and serves the result via a blob: URL.
 *
 * The blob URL is cached to avoid re-fetching assets on every editor open.
 *
 * @param urls - Resolved app:// asset URLs for all Monaco and formatter scripts.
 * @returns A blob: URL pointing to the patched HTML.
 */
export async function buildBlobUrl(urls: AssetUrls): Promise<string> {
  // Check if plugin assets have changed (URLs contain timestamps); reuse cache if unchanged. Usefull on Dev Mode.
  const urlsKey = urls.bundleJsUrl;
  if (_cachedBlobUrl && _cachedUrlsKey === urlsKey) return _cachedBlobUrl;
  // Invalidate previous cache to free memory and prepare for rebuild
  revokeBlobUrlCache();

  _cachedUrlsKey = urlsKey;

  // Inject <base href> for loader.js
  let html = await (await fetch(urls.htmlUrl)).text();
  // Strips the filename from the HTML URL to get the base directory.
  // Before: "app://local/path/to/monacoEditor.html"
  // After:  "app://local/path/to/"
  const baseUrl = urls.htmlUrl.replace(/[^/]+$/, '');
  html = html.replace(
    '<meta charset="UTF-8" />',
    `<meta charset="UTF-8" />\n\t\t<base href="${baseUrl}" />`
  );

  // All assets are fetched in parallel here (host side) rather than sequentially from inside
  // the iframe. This eliminates N sequential round-trips through Electron's app:// handler
  // that caused 5-10s load times after a rebuild (cache invalidation forces re-fetch of all scripts).
  const fetchText = async (url: string): Promise<string> => {
    try {
      const res = await fetch(url);
      if (!res.ok) return '';
      return await res.text();
    } catch {
      return '';
    }
  };

  // The HTML parser scans for </script> before JS runs, so a literal "</script>" anywhere
  // inside an inline <script> block terminates it early — and JS-level escaping does not help
  // because the HTML parser acts first and does not understand JS escape sequences.
  // Prettier's HTML plugin is the main offender: it contains code that parses HTML literals,
  // so its source inevitably includes those sequences.
  //
  // Solution: encode the script as base64. Base64 only uses [A-Za-z0-9+/=],
  // which contains no HTML-special characters, so the HTML parser can never misread it.
  // atob() decodes it at runtime inside the iframe, and (0,eval) executes it.
  //
  // (0,eval) is an indirect eval: it runs in the global scope instead of the local
  // function scope, which is required because Prettier and Monaco expect a global context.
  const inlineScript = (text: string): string => {
    if (!text) return '';
    const b64 = Buffer.from(text, 'utf8').toString('base64');
    return `(0,eval)(atob("${b64}"))`;
  };

  const [
    cssText,
    configCssText,
    prettierBase,
    prettierMarkdown,
    prettierEstree,
    prettierTypescript,
    prettierBabel,
    prettierPostcss,
    prettierHtml,
    prettierYaml,
    prettierGraphql,
    mermaidFormatter,
    clangFormatter,
    ruffFormatter,
    gofmtFormatter,
    bundleJs
  ] = await Promise.all([
    fetchText(`${urls.vsBase}/editor/editor.main.css`),
    fetchText(urls.configCssUrl),
    fetchText(urls.prettierBase),
    fetchText(urls.prettierMarkdownUrl),
    fetchText(urls.prettierEstreeUrl),
    fetchText(urls.prettierTypescriptUrl),
    fetchText(urls.prettierBabelUrl),
    fetchText(urls.prettierPostcssUrl),
    fetchText(urls.prettierHtmlUrl),
    fetchText(urls.prettierYamlUrl),
    fetchText(urls.prettierGraphqlUrl),
    fetchText(urls.mermaidFormatterUrl),
    fetchText(urls.clangFormatterUrl),
    fetchText(urls.ruffFormatterUrl),
    fetchText(urls.gofmtFormatterUrl),
    fetchText(urls.bundleJsUrl)
  ]);

  // Critical assets: without these, the editor cannot function at all
  if (!bundleJs || !cssText) {
    revokeBlobUrlCache();
    throw new Error('Failed to load critical Monaco assets (bundle or CSS). Check network/disk access.');
  }

  // Replaces the inlined data: font source in Monaco's @font-face with an app:// URL.
  // Obsidian's CSP blocks data: URIs for fonts inside child frames; an app:// URL is allowed.
  //
  // Before: @font-face { src: url(data:font/ttf;base64,AAAA...) format('truetype') }
  // After:  @font-face { src: url('app://local/.../codicon.ttf') format('truetype') }
  const codiconFontUrl = `${urls.vsBase}/editor/codicon.ttf`;
  const patchedCss = cssText.replace(
    /(@font-face\s*\{[^}]*src:[^;]*)url\([^)]+\)\s*format\(["']truetype["']\)/g,
    `$1url('${codiconFontUrl}') format('truetype')`
  );

  // Inject CSS inline and intercept dynamic <link rel="stylesheet"> insertions Monaco attempts at runtime.
  // Without this, Monaco tries to inject its CSS via <link> which Obsidian's CSP blocks in child frames.
  // appendChild is monkey-patched: <link> nodes are silently dropped (returned without inserting)
  // so Monaco doesn't throw, while all other nodes are inserted normally via the original appendChild.
  // Inject parseEditorConfig as inline JavaScript because the iframe is isolated
  // and cannot import from settingsUtils.ts. This is a duplicate of the TypeScript
  // version in settingsUtils.ts — keep them in sync (same regex patterns, same logic).
  html = html.replace(
    '</head>',
    `<script>
function parseEditorConfig(str) {
    return JSON.parse(
        str
            // Remove single-line comments.
            // Before: { "fontSize": 14 // default }
            // After:  { "fontSize": 14  }
            .replace(/\\/\\/[^\\n]*/g, '')
            // Remove block comments.
            // Before: { /* theme */ "theme": "vs-dark" }
            // After:  { "theme": "vs-dark" }
            .replace(/\\/\\*[\\s\\S]*?\\*\\//g, '')
            // Remove trailing commas before } or ] (invalid JSON).
            // Before: { "fontSize": 14, }
            // After:  { "fontSize": 14 }
            .replace(/,(\\s*[}\\]])/g, '$1')
    );
}
</script>
<style>${patchedCss}</style>
<style>${configCssText}</style>
<script>
// Monkey-patch appendChild to intercept dynamic <link> insertions from Monaco.
// This is necessary because Monaco attempts to inject its CSS via <link rel="stylesheet">
// which is blocked by Obsidian's CSP in child frames (iframes).
// By dropping the <link> nodes and keeping only the inline <style> below,
// we satisfy both Monaco's loading logic and Obsidian's security policy.
(function() {
    var _orig = Element.prototype.appendChild;
    Element.prototype.appendChild = function(node) {
        if (node.tagName === 'LINK' && node.rel === 'stylesheet') return node;
        return _orig.call(this, node);
    };
})();
</script>
<script>${inlineScript(prettierBase)}</script>
<script>${inlineScript(prettierMarkdown)}</script>
<script>${inlineScript(prettierEstree)}</script>
<script>${inlineScript(prettierTypescript)}</script>
<script>${inlineScript(prettierBabel)}</script>
<script>${inlineScript(prettierPostcss)}</script>
<script>${inlineScript(prettierHtml)}</script>
<script>${inlineScript(prettierYaml)}</script>
<script>${inlineScript(prettierGraphql)}</script>
<script>${inlineScript(mermaidFormatter)}</script>
<script>window.__CLANG_WASM_URL__ = '${urls.clangWasmUrl}';</script>
<script>${inlineScript(clangFormatter)}</script>
<script>window.__RUFF_WASM_URL__ = '${urls.ruffWasmUrl}';</script>
<script>${inlineScript(ruffFormatter)}</script>
<script>window.__GOFMT_WASM_URL__ = '${urls.gofmtWasmUrl}';</script>
<script>${inlineScript(gofmtFormatter)}</script>
<script>${inlineScript(bundleJs)}</script>
</head>`
  );

  // Wrap the patched HTML in a Blob and serve it via a blob: URL.
  // Naive approaches to load the local HTML file are all blocked:
  //   - iframe.src = file:///...monacoEditor.html : blocked by Electron's CSP.
  //   - srcdoc and data: URLs cannot run scripts under Obsidian's CSP.
  // A blob: URL bypasses these restrictions: it is treated as same-origin by the iframe,
  // which allows app:// script sources while keeping the patched HTML fully inline.
  const blob = new Blob([html], { type: 'text/html' });
  _cachedBlobUrl = URL.createObjectURL(blob);
  return _cachedBlobUrl;
}

/** Call once on plugin unload to free memory. */
export function revokeBlobUrlCache(): void {
  if (_cachedBlobUrl) {
    URL.revokeObjectURL(_cachedBlobUrl);
    _cachedBlobUrl = null;
  }
}
