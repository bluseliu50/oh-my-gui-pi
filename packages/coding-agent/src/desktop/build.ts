import * as fs from "node:fs/promises";
import * as path from "node:path";
import { compile } from "@tailwindcss/node";

const packageRoot = process.cwd();
const distRoot = path.join(packageRoot, "dist", "desktop");
const rendererSourceRoot = path.join(packageRoot, "src", "desktop", "renderer");
const rendererDistRoot = path.join(distRoot, "renderer");

async function extractTailwindClasses(dir: string): Promise<Set<string>> {
	const classes = new Set<string>();
	const classPattern = /className\s*=\s*["'`]([^"'`]+)["'`]/g;

	async function scan(currentDir: string): Promise<void> {
		const entries = await fs.readdir(currentDir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path.join(currentDir, entry.name);
			if (entry.isDirectory()) {
				await scan(fullPath);
				continue;
			}
			if (!entry.isFile() || !/\.(tsx|ts|jsx|js)$/.test(entry.name)) {
				continue;
			}
			const source = await Bun.file(fullPath).text();
			const matches = source.matchAll(classPattern);
			for (const match of matches) {
				for (const className of match[1].split(/\s+/)) {
					if (className) {
						classes.add(className);
					}
				}
			}
		}
	}

	await scan(dir);
	return classes;
}

function assertBuildSuccess(result: Bun.BuildOutput, label: string): void {
	if (result.success) return;
	console.error(`${label} failed`);
	for (const log of result.logs) {
		console.error(log);
	}
	process.exit(1);
}

async function buildRendererCss(): Promise<void> {
	console.log("Building desktop renderer CSS...");
	const sourceCss = await Bun.file(path.join(rendererSourceRoot, "styles.css")).text();
	const candidates = await extractTailwindClasses(rendererSourceRoot);
	const compiler = await compile(sourceCss, {
		base: rendererSourceRoot,
		onDependency: () => {},
	});
	await Bun.write(path.join(rendererDistRoot, "styles.css"), compiler.build([...candidates]));
}

async function buildRendererBundle(): Promise<void> {
	console.log("Building desktop renderer bundle...");
	const result = await Bun.build({
		entrypoints: [path.join(rendererSourceRoot, "index.tsx")],
		outdir: rendererDistRoot,
		target: "browser",
		format: "esm",
		naming: "[dir]/[name].[ext]",
		minify: false,
	});
	assertBuildSuccess(result, "Desktop renderer build");
}

async function buildElectronHost(): Promise<void> {
	console.log("Building desktop Electron host...");
	const result = await Bun.build({
		entrypoints: [
			path.join(packageRoot, "src", "desktop", "main.ts"),
			path.join(packageRoot, "src", "desktop", "preload.ts"),
		],
		outdir: distRoot,
		target: "node",
		format: "cjs",
		naming: "[name].cjs",
		external: ["electron"],
		minify: false,
	});
	assertBuildSuccess(result, "Desktop host build");
}

async function buildBackendBundle(): Promise<void> {
	console.log("Building desktop backend bundle...");
	const result = await Bun.build({
		entrypoints: [path.join(packageRoot, "src", "cli.ts")],
		outdir: distRoot,
		target: "bun",
		format: "esm",
		naming: "backend.js",
		external: ["mupdf"],
		minify: false,
	});
	assertBuildSuccess(result, "Desktop backend build");
}

async function writeRendererHtml(): Promise<void> {
	const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" />
	<title>oh-my-gui-pi</title>
	<link rel="stylesheet" href="styles.css" />
</head>
<body>
	<div id="root"></div>
	<script src="index.js" defer></script>
</body>
</html>`;
	await Bun.write(path.join(rendererDistRoot, "index.html"), html);
}

await fs.rm(distRoot, { recursive: true, force: true });
await buildRendererCss();
await buildRendererBundle();
await buildElectronHost();
await buildBackendBundle();
await writeRendererHtml();
console.log(`Desktop build complete: ${distRoot}`);
