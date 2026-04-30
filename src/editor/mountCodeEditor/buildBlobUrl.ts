import type { AssetUrls } from '../../types/types.ts';

/**
 * Fetches the Monaco iframe HTML, rewrites all asset paths to absolute app:// URLs,
 * inlines Monaco CSS (blocked by Obsidian's CSP via <link> in child frames),
 * patches the codicon @font-face src (data: fonts are blocked in child frames),
 * and serves the result via a blob: URL.
 *
 * The blob: URL must be revoked via URL.revokeObjectURL() in the editor's destroy().
 *
 * @param urls - Resolved app:// asset URLs for all Monaco and formatter scripts.
 * @returns A blob: URL pointing to the patched HTML.
 */
export async function buildBlobUrl(urls: AssetUrls): Promise<string> {
	let html = await (await fetch(urls.htmlUrl)).text();

	// Patch relative ./vs paths to absolute app:// URLs so Monaco can load its workers and modules
	html = html
		.replace("'./vs'", `'${urls.vsBase}'`)
		.replace('"./vs/loader.js"', `"${urls.vsBase}/loader.js"`)
		.replace('"./monacoHtml.js"', `"${urls.configJsUrl}"`)
		.replace('"./monacoDiff.js"', `"${urls.diffJsUrl}"`)
		.replace('"./monacoFormatters.js"', `"${urls.formattersJsUrl}"`)
		.replace('"./monacoActions.js"', `"${urls.actionsJsUrl}"`)
		.replace('<link rel="stylesheet" href="./monacoHtml.css" />', '');

	const cssUrl = `${urls.vsBase}/editor/editor.main.css`;
	let cssText = await (await fetch(cssUrl)).text();

	// Replace the base64-encoded font source in @font-face with an absolute app:// URL.
	// Obsidian's CSP blocks data: font sources in child frames, but app:// URLs are allowed.
	const codiconFontUrl = `${urls.vsBase}/editor/codicon.ttf`;

	// In Monaco's CSS, the codicon @font-face src ends with url(<base64-data>) format('truetype').
	// Obsidian's CSP blocks data: font sources in child frames — replace with the local app:// URL.
	// Group 1 captures everything up to the url() to preserve the rest of the rule intact.
	cssText = cssText.replace(
		/(@font-face\s*\{[^}]*src:[^;]*)url\([^)]+\)\s*format\(["']truetype["']\)/g,
		`$1url('${codiconFontUrl}') format('truetype')`
	);

	// Fetch and inline the monacoHtml.css config
	const configCssText = await (await fetch(urls.configCssUrl)).text();

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
<script src="${urls.prettierBase}"></script>
<script src="${urls.prettierMarkdownUrl}"></script>
<script src="${urls.prettierEstreeUrl}"></script>
<script src="${urls.prettierTypescriptUrl}"></script>
<script src="${urls.prettierBabelUrl}"></script>
<script src="${urls.prettierPostcssUrl}"></script>
<script src="${urls.prettierHtmlUrl}"></script>
<script src="${urls.prettierYamlUrl}"></script>
<script src="${urls.prettierGraphqlUrl}"></script>
<script src="${urls.mermaidFormatterUrl}"></script>
<script src="${urls.clangFormatterUrl}"></script>
<script>window.__CLANG_WASM_URL__ = '${urls.clangWasmUrl}';</script>
<script src="${urls.ruffFormatterUrl}"></script>
<script>window.__RUFF_WASM_URL__ = '${urls.ruffWasmUrl}';</script>
<script src="${urls.gofmtFormatterUrl}"></script>
<script>window.__GOFMT_WASM_URL__ = '${urls.gofmtWasmUrl}';</script>
<script src="${urls.configJsUrl}"></script>
<script src="${urls.diffJsUrl}"></script>
<script src="${urls.formattersJsUrl}"></script>
<script src="${urls.actionsJsUrl}"></script>
<style>${cssText}</style>
<style>${configCssText}</style>
<script>
// Monkey-patch appendChild to intercept dynamic <link> insertions from Monaco.
// This is necessary because Monaco attempts to inject its CSS via <link rel="stylesheet">
// which is blocked by Obsidian's CSP in child frames (iframes).
// By dropping the <link> nodes and keeping only the inline <style> below,
// we satisfy both Monaco's loading logic and Obsidian's security policy.
const _orig = Element.prototype.appendChild;
Element.prototype.appendChild = function(node) {
    if (node.tagName === 'LINK' && node.rel === 'stylesheet') return node;
    return _orig.call(this, node);
};
</script>
</head>`
	);

	/**
	 * Wrap the patched HTML in a Blob and serve it via a blob: URL.
	 * This is required because naive approaches to load the local HTML file are all blocked:
	 *  - iframe.src = file:///...monacoEditor.html : blocked by Electron's CSP.
	 *  - srcdoc and data: URLs cannot run scripts under Obsidian's CSP.
	 * A blob: URL bypasses these restrictions — it is treated as same-origin by the iframe
	 * and allows app:// script sources, while containing the patched HTML inline.
	 * blobUrl must be revoked in destroy() to avoid a memory leak.
	 */
	const blob = new Blob([html], { type: 'text/html' });
	return URL.createObjectURL(blob);
}
