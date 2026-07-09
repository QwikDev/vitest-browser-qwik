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
	VariableDeclarator,
} from "@oxc-project/types";
import type { Component } from "@qwik.dev/core";
import type { QwikManifest } from "@qwik.dev/core/optimizer";
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
	if (!module) {
		throw new Error(`Module "${moduleId}" not found in client module graph.`);
	}
	return module;
};
export async function renderComponentToSSR(
	ctx: BrowserCommandContext,
	Component: Component,
	props: Record<string, unknown> = {},
): Promise<{ html: string }> {
	const viteServer = ctx.project.vite as ViteDevServer;

	const qwikModule = await viteServer.ssrLoadModule("@qwik.dev/core");
	const { jsx } = qwikModule;
	const jsxElement = jsx(Component, props);

	const serverModule = await viteServer.ssrLoadModule("@qwik.dev/core/server");
	const { renderToStream } =
		serverModule as typeof import("@qwik.dev/core/server");

	// Handler symbols resolve against the browser's own vite server, not ctx.project.vite.
	// Core (#8816) bootstraps user-segment parents on demand, so no pre-warming here.
	const browserViteServer = (ctx.project.browser?.vite ??
		viteServer) as ViteDevServer;
	// Dev has no manifest — core derives user-segment URLs from the parent module's
	// vite URL (getDevSegmentPath in @qwik.dev/core server/platform.ts), so we only
	// map the internal handler symbols (_[a-z]) here. Core would point those at a
	// virtual @qwik-handlers URL that doesn't resolve in the browser server, so
	// override them to the real handlers.mjs URL; user segments fall through to core.
	const mapping: QwikManifest["mapping"] = {};
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
	// Minimal manifest: makes core's dev symbol-mapper active and carries the
	// handler overrides above; everything else resolves via getDevSegmentPath.
	const qwikManifest = {
		manifestHash: "dev",
		mapping,
	} as QwikManifest;

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
