import { dirname, relative, resolve } from "node:path";
import type {
	BindingIdentifier,
	CallExpression,
	ExpressionStatement,
	FunctionType,
	ImportDeclaration,
	ImportDefaultSpecifier,
	ImportSpecifier,
	JSXAttribute,
	JSXAttributeItem,
	JSXElement,
	JSXExpressionContainer,
	Node,
	Function as OxcFunction,
	Span,
	VariableDeclaration,
	VariableDeclarator,
} from "@oxc-project/types";
import type { Component } from "@qwik.dev/core";
import type { QwikManifest } from "@qwik.dev/core/optimizer";
import MagicString from "magic-string";
import { parseSync } from "oxc-parser";
import { ResolverFactory } from "oxc-resolver";
import type { ViteDevServer } from "vite";
import type { BrowserCommandContext } from "vitest/node";

const DEBUG = false;

const resolver = new ResolverFactory({
	extensions: [".tsx", ".ts", ".jsx", ".js"],
});

export function isFunction(node: Node): node is OxcFunction {
	const functionTypes: FunctionType[] = [
		"FunctionDeclaration",
		"FunctionExpression",
		"TSDeclareFunction",
		"TSEmptyBodyFunctionExpression",
	];
	return functionTypes.includes(node.type as FunctionType);
}

export function isCallExpression(node: Node): node is CallExpression {
	return node.type === "CallExpression";
}

export function isImportDeclaration(node: Node): node is ImportDeclaration {
	return node.type === "ImportDeclaration";
}

export function isVariableDeclarator(node: Node): node is VariableDeclarator {
	return node.type === "VariableDeclarator";
}

export function isExpressionStatement(node: Node): node is ExpressionStatement {
	return node.type === "ExpressionStatement";
}

export function isJSXElement(node: Node): node is JSXElement {
	return node.type === "JSXElement";
}

export function isJSXExpressionContainer(
	node: Node,
): node is JSXExpressionContainer {
	return node.type === "JSXExpressionContainer";
}

export function traverseChildren(
	node: Node,
	callback: (child: Node) => boolean | undefined,
): boolean {
	for (const key in node) {
		const child = (node as unknown as Record<string, unknown>)[key];
		if (Array.isArray(child)) {
			for (const item of child) {
				if (item && typeof item === "object" && callback(item as Node)) {
					return true;
				}
			}
		} else if (child && typeof child === "object" && callback(child as Node)) {
			return true;
		}
	}
	return false;
}

export function hasRenderSSRCallInAST(ast: Node, code: string): boolean {
	const renderSSRIdentifiers = new Set<string>(["renderSSR"]);
	let hasRenderSSRCallInCode = false;

	function walkForDetection(node: Node): boolean {
		if (!node || typeof node !== "object") return false;

		if (isImportDeclaration(node) && node.source?.value && node.specifiers) {
			for (const spec of node.specifiers) {
				if (spec.type === "ImportSpecifier") {
					const importSpec = spec as ImportSpecifier;
					if (
						importSpec.imported.type === "Identifier" &&
						importSpec.imported.name === "renderSSR"
					) {
						renderSSRIdentifiers.add(importSpec.local.name);
					}
				} else if (spec.type === "ImportDefaultSpecifier") {
					const defaultSpec = spec as ImportDefaultSpecifier;
					if (defaultSpec.local.name.toLowerCase().includes("renderssr")) {
						renderSSRIdentifiers.add(defaultSpec.local.name);
					}
				}
			}
		}

		if (isFunction(node) && node.id?.name === "renderSSR") {
			renderSSRIdentifiers.add("renderSSR");
		}

		if (isVariableDeclarator(node)) {
			if (
				node.id.type === "Identifier" &&
				node.init?.type === "Identifier" &&
				renderSSRIdentifiers.has(node.init.name)
			) {
				const bindingId = node.id as BindingIdentifier;
				renderSSRIdentifiers.add(bindingId.name);
			}
		}

		if (
			isCallExpression(node) &&
			node.callee.type === "Identifier" &&
			renderSSRIdentifiers.has(node.callee.name)
		) {
			hasRenderSSRCallInCode = true;
			return true;
		}

		return traverseChildren(node, walkForDetection);
	}

	walkForDetection(ast);

	return hasRenderSSRCallInCode || code.includes("renderSSR(");
}

export function extractPropsFromJSX(
	attributes: JSXAttributeItem[],
	sourceCode: string,
): Record<string, string> {
	const props: Record<string, string> = {};

	for (const attr of attributes) {
		if (attr.type !== "JSXAttribute") continue;

		const jsxAttr = attr as JSXAttribute;
		if (jsxAttr.name.type !== "JSXIdentifier" || !jsxAttr.value) continue;

		const propName = jsxAttr.name.name;

		if (
			isJSXExpressionContainer(jsxAttr.value) &&
			jsxAttr.value.expression.type !== "JSXEmptyExpression"
		) {
			const exprSpan = jsxAttr.value.expression as Node & Span;
			const expressionCode = sourceCode.slice(exprSpan.start, exprSpan.end);
			props[propName] = expressionCode;
		} else if (jsxAttr.value.type === "Literal") {
			const literal = jsxAttr.value as { value: unknown };
			props[propName] = JSON.stringify(literal.value);
		}
	}

	return props;
}

function fallbackResolveComponentPath(
	importPath: string,
	testFileId: string,
): string {
	if (!importPath.startsWith(".")) {
		return importPath.endsWith(".tsx") || importPath.endsWith(".ts")
			? importPath
			: `${importPath}.tsx`;
	}

	const testFileDir = dirname(testFileId);
	const resolvedPath = resolve(testFileDir, importPath);
	const projectRoot = process.cwd();
	let componentPath = `./${relative(projectRoot, resolvedPath)}`;

	if (!componentPath.endsWith(".tsx") && !componentPath.endsWith(".ts")) {
		componentPath += ".tsx";
	}

	return componentPath;
}

export function resolveComponentPath(
	importPath: string,
	testFileId: string,
): string {
	const testFileDir = dirname(testFileId);
	const result = resolver.sync(testFileDir, importPath);

	if (result.error || !result.path) {
		console.warn(
			`[oxc-resolver] Could not resolve "${importPath}" from "${testFileId}": ${result.error || "No path resolved"}. Using fallback resolution.`,
		);
		return fallbackResolveComponentPath(importPath, testFileId);
	}

	const projectRoot = process.cwd();
	const relativePath = relative(projectRoot, result.path);

	return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

export function hasCommandsImport(node: Node): boolean {
	if (
		!isImportDeclaration(node) ||
		node.source?.value !== "vitest/browser" ||
		!node.specifiers
	) {
		return false;
	}

	return node.specifiers.some(
		(spec) =>
			spec.type === "ImportSpecifier" &&
			spec.imported.type === "Identifier" &&
			spec.imported.name === "commands",
	);
}

function isBrowserOnlySource(source: string | undefined): boolean {
	if (!source) return false;
	return (
		source === "vitest" ||
		source.startsWith("vitest/") ||
		source === "vitest-browser-qwik" ||
		source.startsWith("vitest-browser-qwik/") ||
		source.includes("@vitest/")
	);
}

function referencesStrippedId(
	node: Node | null | undefined,
	strippedIds: Set<string>,
): boolean {
	if (!node || typeof node !== "object") return false;
	if (node.type === "Identifier") return strippedIds.has(node.name);
	if (node.type === "MemberExpression")
		return referencesStrippedId(node.object as Node, strippedIds);
	if (isCallExpression(node))
		return referencesStrippedId(node.callee as Node, strippedIds);
	return false;
}

function isVariableDeclaration(node: Node): node is VariableDeclaration {
	return node.type === "VariableDeclaration";
}

/**
 * Strips vitest-only imports and test/describe/it statements so a test module can be
 * ssrLoadModule'd under its own path. Keeping the original path matters: qwik segment
 * hashes are path-salted, so serialized QRLs only resolve against the client-transformed
 * test module if SSR rendered from the same id. Local components are re-exported so the
 * renderSSRLocal command can pick them up.
 */
export function cleanTestModuleForSSR(
	id: string,
	code: string,
): { code: string; map: ReturnType<MagicString["generateMap"]> } | null {
	const ast = parseSync(id, code);
	const s = new MagicString(code);
	const strippedIds = new Set<string>();
	const localComponents = new Set<string>();
	const exportedNames = new Set<string>();

	function cleanTestFile(node: Node): undefined {
		if (isImportDeclaration(node) && isBrowserOnlySource(node.source?.value)) {
			for (const spec of node.specifiers || []) {
				if (spec.local?.name) strippedIds.add(spec.local.name);
			}
			s.remove(node.start, node.end);
			return undefined;
		}

		if (
			isExpressionStatement(node) &&
			node.expression?.type === "CallExpression"
		) {
			const callExpr = node.expression;
			if (callExpr.callee.type === "Identifier") {
				const calleeName = callExpr.callee.name;
				if (
					calleeName === "test" ||
					calleeName === "describe" ||
					calleeName === "it"
				) {
					s.remove(node.start, node.end);
					return undefined;
				}
			}
		}

		if (node.type === "ExportNamedDeclaration") {
			const exportNode = node as Node & {
				specifiers?: { exported?: { name?: string } }[];
				declaration?: VariableDeclaration | null;
			};
			for (const spec of exportNode.specifiers || []) {
				if (spec.exported?.name) exportedNames.add(spec.exported.name);
			}
			if (
				exportNode.declaration &&
				isVariableDeclaration(exportNode.declaration)
			) {
				for (const d of exportNode.declaration.declarations) {
					if (d.id.type === "Identifier") exportedNames.add(d.id.name);
				}
			}
		}

		if (isVariableDeclaration(node)) {
			const allReference = node.declarations.every((d) =>
				referencesStrippedId(d.init as Node | null, strippedIds),
			);
			if (allReference) {
				for (const d of node.declarations) {
					if (d.id.type === "Identifier") strippedIds.add(d.id.name);
				}
				s.remove(node.start, node.end);
				return undefined;
			}
		}

		if (
			isVariableDeclarator(node) &&
			node.id.type === "Identifier" &&
			node.init?.type === "CallExpression" &&
			node.init.callee.type === "Identifier" &&
			node.init.callee.name === "component$"
		) {
			localComponents.add(node.id.name);
		}

		traverseChildren(node, cleanTestFile);
		return undefined;
	}

	cleanTestFile(ast.program);

	const toExport = [...localComponents].filter((n) => !exportedNames.has(n));
	if (toExport.length > 0) {
		s.append(
			`\n\n// Auto-generated exports for local components\nexport { ${toExport.join(", ")} };`,
		);
	}

	if (!s.hasChanged()) return null;

	return {
		code: s.toString(),
		map: s.generateMap({ hires: true }),
	};
}

const getClientModule = async (viteServer: ViteDevServer, moduleId: string) => {
	const clientEnv = viteServer.environments.client;
	await clientEnv.fetchModule(moduleId);
	const resolved = await clientEnv.moduleGraph.resolveUrl(moduleId);
	const resolvedId = resolved?.[1];
	if (!resolvedId) {
		throw new Error(
			`Could not resolve module "${moduleId}" in client environment`,
		);
	}
	const module = clientEnv.moduleGraph.getModuleById(resolvedId);
	// console.log("Resolved client module", moduleId, resolved, module);
	if (!module) {
		throw new Error(`Module "${moduleId}" not found in client module graph.`);
	}
	return module;
};
/**
 * Transforms the given modules (and their local imports, transitively) in the client
 * environment of the given server. Serialized dev QRLs point at path-derived segment
 * URLs that qwikVite can only serve once the segment's parent module has been
 * transformed in that client environment — without this, resume finds no handlers.
 * User segments are intentionally NOT added to the manifest mapping: a mapping entry
 * makes the serializer emit prod-style hash-only symbol names, which dev segment
 * modules (exporting full symbol names) cannot satisfy.
 */
async function warmClientModuleGraph(
	viteServer: ViteDevServer,
	rootModuleIds: string[],
): Promise<void> {
	const visited = new Set<string>();
	const queue = [...rootModuleIds];

	while (queue.length > 0) {
		const moduleId = queue.shift() as string;
		if (visited.has(moduleId)) continue;
		visited.add(moduleId);

		let module: Awaited<ReturnType<typeof getClientModule>>;
		try {
			module = await getClientModule(viteServer, moduleId);
		} catch (e) {
			DEBUG && console.log("warm: FAILED", moduleId, e);
			continue;
		}
		if (module.id) visited.add(module.id);

		for (const importedModule of module.importedModules) {
			const importedId = importedModule.id;
			if (
				!importedId ||
				importedId.includes("node_modules") ||
				importedId.startsWith("\0")
			) {
				continue;
			}
			queue.push(importedId);
		}
	}
}

export async function renderComponentToSSR(
	ctx: BrowserCommandContext,
	Component: Component,
	props: Record<string, unknown> = {},
	extraClientModuleIds: string[] = [],
): Promise<{ html: string }> {
	const viteServer = ctx.project.vite as ViteDevServer;

	const qwikModule = await viteServer.ssrLoadModule("@qwik.dev/core");
	const { jsx } = qwikModule;
	const jsxElement = jsx(Component, props);

	const serverModule = await viteServer.ssrLoadModule("@qwik.dev/core/server");
	const { renderToStream } =
		serverModule as typeof import("@qwik.dev/core/server");

	if (!ctx.testPath) {
		throw new Error("ctx.testPath is required for SSR rendering");
	}
	// The browser is served by its own vite server, distinct from ctx.project.vite that
	// renders the SSR HTML — QRLs resolve at runtime against the browser server, so its
	// client module graph is the one that must be warmed.
	const browserViteServer = (ctx.project.browser?.vite ??
		viteServer) as ViteDevServer;
	await warmClientModuleGraph(browserViteServer, [
		ctx.testPath,
		...extraClientModuleIds,
	]);
	const mapping: QwikManifest["mapping"] = {};
	// qwik-internal qrl handlers
	const handlersModule = await getClientModule(
		browserViteServer,
		"@qwik.dev/core/handlers.mjs",
	);
	const handlersUrl = handlersModule.url;
	if (!handlersUrl) {
		throw new Error("Handlers module URL could not be resolved");
	}
	const handlerNames = Object.keys(serverModule).filter((key) =>
		/^_[a-z]+$/.test(key),
	);
	for (const key of handlerNames) {
		mapping[key] = handlersUrl;
	}
	const qwikManifest = {
		manifestHash: "dev",
		mapping,
	} as QwikManifest;

	//  await Promise.allSettled([...viteServer.moduleGraph.idToModuleMap.keys()].map(id => viteServer.environments.client.fetchModule(id)));
	DEBUG && console.log("mapping", mapping);

	let html = DEBUG
		? "<script>var _import=(s)=>{console.log('importing', s);return import(s)};document.addEventListener('qerror',(e)=>console.error('QERROR', e.detail?.error?.stack || e.detail?.error || e.detail));</script>"
		: "";

	await renderToStream(jsxElement, {
		manifest: qwikManifest,
		containerTagName: "div",
		base: "/",
		stream: {
			write(chunk: string) {
				if (DEBUG) {
					html += chunk.replace(/=import\(/g, "=_import(");
				} else {
					html += chunk;
				}
			},
		},
	});
	DEBUG && console.log("FINAL HTML", html);
	return { html };
}
