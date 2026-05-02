import type { AssetUrls, Prettify } from '../../types/index.ts';

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
export async function buildBlobUrl(urls: Prettify<AssetUrls>): Promise<string> {
	// Invalidate cache if the plugin was rebuilt (URLs contain a new timestamp)
	const urlsKey = urls.bundleJsUrl;
	if (_cachedBlobUrl && _cachedUrlsKey === urlsKey) return _cachedBlobUrl;
	if (_cachedBlobUrl) {
		URL.revokeObjectURL(_cachedBlobUrl);
		_cachedBlobUrl = null;
	}
	_cachedUrlsKey = urlsKey;
	let html = await (await fetch(urls.htmlUrl)).text();

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

	// Buffer.from().toString('base64') is used instead of escaping because Prettier plugins
	// contain raw HTML (the HTML plugin parses HTML literals), which causes the HTML parser
	// to misinterpret </script> and <!-- sequences inside inline <script> tags regardless
	// of JS-level escaping. Base64 uses only [A-Za-z0-9+/=] — no HTML-special characters possible.
	// atob() decodes at runtime inside the iframe.
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

	// Patch codicon @font-face: replace data: source with app:// URL (CSP blocks data: fonts in child frames)
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
            .replace(/\\/\\/[^\\n]*/g, '')
            .replace(/\\/\\*[\\s\\S]*?\\*\\//g, '')
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

	/**
	 * Wrap the patched HTML in a Blob and serve it via a blob: URL.
	 * This is required because naive approaches to load the local HTML file are all blocked:
	 *  - iframe.src = file:///...monacoEditor.html : blocked by Electron's CSP.
	 *  - srcdoc and data: URLs cannot run scripts under Obsidian's CSP.
	 * A blob: URL bypasses these restrictions — it is treated as same-origin by the iframe
	 * and allows app:// script sources, while containing the patched HTML inline.
	 * The blob URL is cached to avoid re-fetching assets on every editor open.
	 */
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
