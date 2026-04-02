import type CodeFilesPlugin from './main.ts';

// Static fallback used before Monaco is loaded (e.g. on restart with files already open)
const staticMap: Record<string, string> = {
	js: 'javascript', es6: 'javascript', jsx: 'javascript', cjs: 'javascript', mjs: 'javascript',
	ts: 'typescript', tsx: 'typescript', cts: 'typescript', mts: 'typescript',
	json: 'json',
	py: 'python', rpy: 'python', pyu: 'python', cpy: 'python', gyp: 'python', gypi: 'python',
	css: 'css', scss: 'scss', less: 'less',
	html: 'html', htm: 'html', shtml: 'html', xhtml: 'html', jsp: 'html', asp: 'html', aspx: 'html',
	cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', hxx: 'cpp',
	c: 'c', h: 'c',
	cs: 'csharp', csx: 'csharp',
	java: 'java', jav: 'java',
	go: 'go',
	rs: 'rust', rlib: 'rust',
	rb: 'ruby', rbx: 'ruby', rjs: 'ruby', gemspec: 'ruby',
	php: 'php', php4: 'php', php5: 'php', phtml: 'php',
	swift: 'swift',
	kt: 'kotlin', kts: 'kotlin',
	sql: 'sql',
	yaml: 'yaml', yml: 'yaml',
	xml: 'xml', xsd: 'xml', dtd: 'xml', xaml: 'xml', xsl: 'xml', xslt: 'xml',
	md: 'markdown', mdx: 'markdown', markdown: 'markdown',
	sh: 'shell', bash: 'shell',
	bat: 'bat', cmd: 'bat',
	lua: 'lua',
	r: 'r',
	dart: 'dart',
	scala: 'scala', sc: 'scala',
	jl: 'julia',
	tf: 'hcl', hcl: 'hcl', tfvars: 'hcl',
	ini: 'ini', properties: 'ini',
	dockerfile: 'dockerfile',
	graphql: 'graphql', gql: 'graphql',
	vb: 'vb',
	pl: 'perl', pm: 'perl',
	ex: 'elixir', exs: 'elixir',
	pug: 'pug', jade: 'pug',
	rst: 'restructuredtext',
	proto: 'proto',
	sol: 'sol',
};

const dynamicMap = new Map<string, string>();

export function registerLanguages(langs: [string, string][]): void {
	for (const [ext, id] of langs) {
		dynamicMap.set(ext, id);
	}
}

async function persistLanguages(plugin: CodeFilesPlugin): Promise<void> {
	const data = await plugin.loadData();
	await plugin.saveData({ ...data, languageMap: Object.fromEntries(dynamicMap) });
}

export async function registerAndPersistLanguages(langs: [string, string][], plugin: CodeFilesPlugin): Promise<void> {
	if (dynamicMap.size > 0) return;
	registerLanguages(langs);
	await persistLanguages(plugin);
}

export async function loadPersistedLanguages(plugin: CodeFilesPlugin): Promise<void> {
	const data = await plugin.loadData();
	if (data?.languageMap) {
		for (const [ext, id] of Object.entries(data.languageMap)) {
			dynamicMap.set(ext, id as string);
		}
	}
}

export function getLanguage(extension: string): string {
	return dynamicMap.get(extension) ?? staticMap[extension] ?? 'plaintext';
}
