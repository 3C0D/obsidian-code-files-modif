import esbuild from 'esbuild';
import path from 'path';
import { copyFile } from 'fs/promises';

interface WasmFormatter {
	entryFile: string;
	outFile: string;
	wasmSrc: string;
	wasmDest: string;
}

async function bundleWasmFormatter(
	pluginDir: string,
	formattersTarget: string,
	isProd: boolean,
	f: WasmFormatter
): Promise<void> {
	await esbuild.build({
		entryPoints: [path.join(pluginDir, f.entryFile)],
		bundle: true,
		format: 'iife',
		outfile: path.join(formattersTarget, f.outFile),
		platform: 'browser',
		minify: isProd,
		loader: { '.wasm': 'file' },
		metafile: true
	});
	await copyFile(
		path.join(pluginDir, f.wasmSrc),
		path.join(formattersTarget, f.wasmDest)
	);
}

export async function bundleFormatters(
	pluginDir: string,
	formattersTarget: string,
	isProd: boolean
): Promise<void> {
	// Mermaid (no WASM)
	await esbuild.build({
		entryPoints: [path.join(pluginDir, 'src/mermaid-formatter-bundle-entry.js')],
		bundle: true,
		format: 'iife',
		outfile: path.join(formattersTarget, 'mermaid-formatter.js'),
		platform: 'browser',
		minify: isProd
	});

	const wasmFormatters: WasmFormatter[] = [
		{
			entryFile: 'src/ruff-formatter-bundle-entry.js',
			outFile: 'ruff-formatter.js',
			wasmSrc: 'node_modules/@wasm-fmt/ruff_fmt/ruff_fmt_bg.wasm',
			wasmDest: 'ruff_fmt_bg.wasm'
		},
		{
			entryFile: 'src/gofmt-formatter-bundle-entry.js',
			outFile: 'gofmt-formatter.js',
			wasmSrc: 'node_modules/@wasm-fmt/gofmt/gofmt.wasm',
			wasmDest: 'gofmt.wasm'
		},
		{
			entryFile: 'src/clang-format-bundle-entry.js',
			outFile: 'clang-formatter.js',
			wasmSrc: 'node_modules/@wasm-fmt/clang-format/clang-format.wasm',
			wasmDest: 'clang-format.wasm'
		}
	];

	for (const f of wasmFormatters) {
		await bundleWasmFormatter(pluginDir, formattersTarget, isProd, f);
	}

	// Prettier plugins
	const prettierPlugins = [
		'markdown',
		'estree',
		'typescript',
		'babel',
		'postcss',
		'html',
		'yaml',
		'graphql'
	];
	for (const plugin of prettierPlugins) {
		await copyFile(
			path.join(pluginDir, `node_modules/prettier/plugins/${plugin}.js`),
			path.join(formattersTarget, `prettier-${plugin}.js`)
		);
	}
	await copyFile(
		path.join(pluginDir, 'node_modules/prettier/standalone.js'),
		path.join(formattersTarget, 'prettier-standalone.js')
	);
}
