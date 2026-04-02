const languageMap = new Map<string, string>();

export function registerLanguages(langs: [string, string][]): void {
	for (const [ext, id] of langs) {
		languageMap.set(ext, id);
	}
}

export function getLanguage(extension: string): string {
	return languageMap.get(extension) ?? 'plaintext';
}
