import { normalizePath } from 'obsidian';
import type CodeFilesPlugin from '../../main.ts';
import type { AssetUrls } from '../../types/types.ts';
import manifest from '../../../manifest.json' with { type: 'json' };

/**
 * Resolves all plugin asset URLs needed to mount the Monaco iframe.
 * Uses the vault adapter to get app:// URLs for local plugin files.
 */
export function resolveAssetUrls(plugin: CodeFilesPlugin): AssetUrls {
	const pluginBase = normalizePath(
		`${plugin.app.vault.configDir}/plugins/${manifest.id}`
	);
	const res = (name: string): string =>
		plugin.app.vault.adapter.getResourcePath(normalizePath(`${pluginBase}/${name}`));

	const htmlUrl = res('monacoEditor.html');
	const vsBase = res('vs').replace(/\?.*$/, ''); // Strip timestamp for use as base path
	const bundleJsUrl = res('monacoBundle.js');
	const configCssUrl = res('monacoHtml.css');
	const prettierBase = res('formatters/prettier-standalone.js');
	const prettierMarkdownUrl = res('formatters/prettier-markdown.js');
	const prettierEstreeUrl = res('formatters/prettier-estree.js');
	const prettierTypescriptUrl = res('formatters/prettier-typescript.js');
	const prettierBabelUrl = res('formatters/prettier-babel.js');
	const prettierPostcssUrl = res('formatters/prettier-postcss.js');
	const prettierHtmlUrl = res('formatters/prettier-html.js');
	const prettierYamlUrl = res('formatters/prettier-yaml.js');
	const prettierGraphqlUrl = res('formatters/prettier-graphql.js');
	const mermaidFormatterUrl = res('formatters/mermaid-formatter.js');
	const clangFormatterUrl = res('formatters/clang-formatter.js');
	const clangWasmUrl = res('formatters/clang-format.wasm');
	const ruffFormatterUrl = res('formatters/ruff-formatter.js');
	const ruffWasmUrl = res('formatters/ruff_fmt_bg.wasm');
	const gofmtFormatterUrl = res('formatters/gofmt-formatter.js');
	const gofmtWasmUrl = res('formatters/gofmt.wasm');

	return {
		vsBase,
		htmlUrl,
		bundleJsUrl,
		configCssUrl,
		prettierBase,
		prettierMarkdownUrl,
		prettierEstreeUrl,
		prettierTypescriptUrl,
		prettierBabelUrl,
		prettierPostcssUrl,
		prettierHtmlUrl,
		prettierYamlUrl,
		prettierGraphqlUrl,
		mermaidFormatterUrl,
		clangFormatterUrl,
		clangWasmUrl,
		ruffFormatterUrl,
		ruffWasmUrl,
		gofmtFormatterUrl,
		gofmtWasmUrl
	};
}
