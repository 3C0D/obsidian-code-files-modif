import type CodeFilesPlugin from '../main.ts';

// Static fallback map used before Monaco has loaded (e.g. on Obsidian restart with files already open).
// dynamicMap takes priority once populated, but this ensures syntax highlighting works immediately.
const staticMap: Record<string, string> = {
	js: 'javascript',
	es6: 'javascript',
	jsx: 'javascript',
	cjs: 'javascript',
	mjs: 'javascript',
	ts: 'typescript',
	tsx: 'typescript',
	cts: 'typescript',
	mts: 'typescript',
	json: 'json',
	jsonc: 'json',
	py: 'python',
	gyp: 'python',
	gypi: 'python',
	css: 'css',
	scss: 'scss',
	less: 'less',
	html: 'html',
	htm: 'html',
	xhtml: 'html',
	jsp: 'html',
	asp: 'html',
	aspx: 'html',
	vue: 'html',
	cpp: 'cpp',
	cc: 'cpp',
	cxx: 'cpp',
	hpp: 'cpp',
	hh: 'cpp',
	hxx: 'cpp',
	c: 'c',
	h: 'c',
	cs: 'csharp',
	csx: 'csharp',
	java: 'java',
	go: 'go',
	rs: 'rust',
	rb: 'ruby',
	gemspec: 'ruby',
	php: 'php',
	phtml: 'php',
	swift: 'swift',
	kt: 'kotlin',
	kts: 'kotlin',
	sql: 'sql',
	yaml: 'yaml',
	yml: 'yaml',
	xml: 'xml',
	xsd: 'xml',
	dtd: 'xml',
	xaml: 'xml',
	xsl: 'xml',
	xslt: 'xml',
	md: 'markdown',
	mdx: 'markdown',
	markdown: 'markdown',
	sh: 'shell',
	bash: 'shell',
	ps1: 'powershell',
	psm1: 'powershell',
	psd1: 'powershell',
	bat: 'bat',
	cmd: 'bat',
	lua: 'lua',
	r: 'r',
	dart: 'dart',
	scala: 'scala',
	sc: 'scala',
	jl: 'julia',
	tf: 'hcl',
	hcl: 'hcl',
	tfvars: 'hcl',
	ini: 'ini',
	properties: 'ini',
	toml: 'toml',
	dockerfile: 'dockerfile',
	graphql: 'graphql',
	gql: 'graphql',
	hbs: 'handlebars',
	groovy: 'groovy',
	gradle: 'groovy',
	pas: 'pascal',
	pp: 'pascal',
	vb: 'vb',
	pl: 'perl',
	pm: 'perl',
	ex: 'elixir',
	exs: 'elixir',
	pug: 'pug',
	jade: 'pug',
	rst: 'restructuredtext',
	proto: 'proto',
	sol: 'sol'
};

// Populated at runtime from monaco.languages.getLanguages() via postMessage.
// Covers all Monaco languages including those not in staticMap, and stays up to date with Monaco versions.
// Persisted in plugin data so it's available immediately on next restart.
const dynamicMap = new Map<string, string>();

/** Fills dynamicMap from a [extension, languageId] array received from the Monaco iframe. */
export function registerLanguages(langs: [string, string][]): void {
	for (const [ext, id] of langs) {
		dynamicMap.set(ext, id);
	}
}

/** Saves dynamicMap to plugin data so it survives restarts. */
async function persistLanguages(plugin: CodeFilesPlugin): Promise<void> {
	const data = await plugin.loadData();
	await plugin.saveData({ ...data, languageMap: Object.fromEntries(dynamicMap) });
}

/**
 * Registers and persists the language map received from Monaco.
 * The guard on dynamicMap.size ensures this only runs once per session —
 * subsequent editors opening would otherwise trigger redundant saveData calls.
 */
export async function registerAndPersistLanguages(
	langs: [string, string][],
	plugin: CodeFilesPlugin
): Promise<void> {
	if (dynamicMap.size > 0) return;
	registerLanguages(langs);
	await persistLanguages(plugin);
}

/** Restores the language map from plugin data on startup, before any Monaco iframe is open. */
export async function loadPersistedLanguages(plugin: CodeFilesPlugin): Promise<void> {
	const data = await plugin.loadData();
	if (data?.languageMap) {
		for (const [ext, id] of Object.entries(data.languageMap)) {
			dynamicMap.set(ext, id as string);
		}
	}
}

/** Returns the Monaco language id for a given file extension.
 *  Priority: dynamicMap (from Monaco) > staticMap (fallback) > 'plaintext'. */
export function getLanguage(extension: string): string {
	return dynamicMap.get(extension) ?? staticMap[extension] ?? 'plaintext';
}

/**
 * Returns all known code extensions, minus exclusions.
 * Uses dynamicMap (from Monaco, ~200 entries) when
 * available, falling back to staticMap (~98 entries)
 * before the first iframe has loaded.
 */
export function getAllMonacoExtensions(
	excludedExtensions: string[]
): string[] {
	const excluded = new Set(excludedExtensions);
	const source = dynamicMap.size > 0
		? [...dynamicMap.keys()]
		: Object.keys(staticMap);
	return source.filter(
		(ext) => !excluded.has(ext)
	);
}
