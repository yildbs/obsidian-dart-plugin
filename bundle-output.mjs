import { copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const pluginId = 'obsidian-dart-plugin';
const outputDir = path.join('output', pluginId);
const releaseFiles = ['main.js', 'manifest.json', 'styles.css'];

await rm(outputDir, { force: true, recursive: true });
await mkdir(outputDir, { recursive: true });

for (const file of releaseFiles) {
	await copyFile(file, path.join(outputDir, file));
}

console.log(`Copied release files to ${outputDir}`);
