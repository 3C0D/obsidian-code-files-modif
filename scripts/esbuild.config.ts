import esbuild from 'esbuild';
import process from 'process';
import { config } from 'dotenv';
import path from 'path';
import { rm, mkdir } from 'fs/promises';
import { type Interface } from 'readline';
import { bundleFormatters } from './build/formatters.js';
import { copyMonacoAssets, copyEditorFiles } from './build/assets.js';
import { obsidianTypingsPlugin } from './build/typingsPlugin.js';
import { EXTERNAL_DEPS, BANNER } from './build/constants.js';
import {
	type Manifest,
	checkManifest,
	validateEnvironment,
	getBuildPath
} from './build/env.js';
import { copyFilesToTargetDir, createReadlineInterface, isValidPath } from './utils.js';

// Determine the plugin directory (where the script is called from)
const pluginDir = process.cwd();

// Create readline interface for prompts
const rl: Interface = createReadlineInterface();

const manifest: Manifest = checkManifest(pluginDir);

config();

async function createBuildContext(
	buildPath: string,
	isProd: boolean,
	entryPoints: string[]
): Promise<esbuild.BuildContext> {
	const plugins = [
		{
			name: 'copy-to-plugins-folder',
			setup: (build: esbuild.PluginBuild): void => {
				build.onEnd(async () => {
					const formattersTarget = path.join(buildPath, 'formatters');
					await mkdir(formattersTarget, { recursive: true });
					await copyMonacoAssets(pluginDir, buildPath);
					await copyEditorFiles(pluginDir, buildPath);
					await bundleFormatters(pluginDir, formattersTarget, isProd);

					if (isProd) {
						if (
							process.argv.includes('-r') ||
							process.argv.includes('real')
						) {
							await copyFilesToTargetDir(buildPath);
							console.log(`Successfully installed in ${buildPath}`);
						} else {
							const folderToRemove = path.join(buildPath, '_.._');
							if (await isValidPath(folderToRemove)) {
								await rm(folderToRemove, { recursive: true });
							}
							console.log('Build done in initial folder');
						}
					} else {
						await copyFilesToTargetDir(buildPath);
					}
				});
			}
		}
	];

	return await esbuild.context({
		banner: { js: BANNER },
		minify: isProd,
		entryPoints,
		bundle: true,
		external: EXTERNAL_DEPS,
		format: 'cjs',
		target: 'esNext',
		platform: 'node',
		logLevel: 'info',
		sourcemap: isProd ? false : 'inline',
		treeShaking: true,
		outdir: buildPath,
		outbase: path.join(pluginDir, 'src'),
		plugins: [obsidianTypingsPlugin(pluginDir), ...plugins]
	});
}

async function main(): Promise<void> {
	try {
		await validateEnvironment(pluginDir);
		const isProd = process.argv[2] === 'production';
		const buildPath = await getBuildPath(pluginDir, manifest, isProd, rl);
		console.log(
			buildPath === pluginDir
				? 'Building in initial folder'
				: `Building in ${buildPath}`
		);

		// Check for CSS in root
		const stylesPath = path.join(pluginDir, 'styles.css');
		const stylePath = (await isValidPath(stylesPath)) ? stylesPath : '';

		const mainTsPath = path.join(pluginDir, 'src/main.ts');
		const entryPoints = stylePath ? [mainTsPath, stylePath] : [mainTsPath];
		const context = await createBuildContext(buildPath, isProd, entryPoints);

		// Create Monaco bundle context (iframe)
		const monacoBundlePath = path.join(pluginDir, 'src/editor/monacoMain.ts');
		const monacoBundleOut = path.join(buildPath, 'monacoBundle.js');
		const monacoContext = await esbuild.context({
			entryPoints: [monacoBundlePath],
			bundle: true,
			format: 'iife',
			platform: 'browser',
			target: 'es2020',
			// Monaco is a global injected by AMD loader — don't bundle it
			external: ['monaco-editor'],
			minify: isProd,
			sourcemap: isProd ? false : 'inline',
			treeShaking: true,
			outfile: monacoBundleOut,
			logLevel: 'info'
		});

		if (isProd) {
			await context.rebuild();
			await monacoContext.rebuild();
			rl.close();
			process.exit(0);
		} else {
			await context.watch();
			await monacoContext.watch();
		}
	} catch (error) {
		console.error('Build failed:', error);
		rl.close();
		process.exit(1);
	}
}

main().catch(console.error);
