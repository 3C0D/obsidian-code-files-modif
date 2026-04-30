import type CodeFilesPlugin from '../../main.ts';
import { readProjectFiles } from '../../utils/projectUtils.ts';

/**
 * Reads all TS/JS files under the project root and sends them to Monaco for IntelliSense.
 * Called once on editor init (on 'ready' message).
 * Isolated here so project-loading logic can evolve independently
 * (e.g. multiple projects, project switching).
 *
 * @param plugin - The plugin instance.
 * @param send - Callback to post a message to the Monaco iframe.
 */
export async function loadProjectFiles(
    plugin: CodeFilesPlugin,
    send: (type: string, payload: Record<string, unknown>) => void
): Promise<void> {
    const files = await readProjectFiles(plugin);
    send('load-project-files', { files });
}
