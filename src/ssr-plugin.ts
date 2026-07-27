import { resolve } from "node:path";
import type { Node, VariableDeclaration } from "@oxc-project/types";
import { anyOf, createRegExp, exactly, maybe } from "magic-regexp";
import MagicString from "magic-string";
import { parseSync } from "oxc-parser";
import type { Plugin } from "vitest/config";
import type { BrowserCommand } from "vitest/node";
import {
	extractPropsFromJSX,
	hasCommandsImport,
	hasRenderSSRCallInAST,
	isCallExpression,
	isExpressionStatement,
	isImportDeclaration,
	isJSXElement,
	isVariableDeclarator,
	renderComponentToSSR,
	resolveComponentPath,
	traverseChildren,
} from "./ssr-plugin-utils";

const isJSorTS = createRegExp(
	exactly(".").and(anyOf("j", "t")).and("s").and(maybe("x")).at.lineEnd(),
);

type ComponentFormat = BrowserCommand<
	[
		componentPath: string,
		componentName: string,
		props?: Record<string, unknown>,
	]
>;

type LocalComponentFormat = BrowserCommand<
	[testFilePath: string, componentName: string, props?: Record<string, unknown>]
>;

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

let userDefines: Record<string, string> = {};

// Test files the SSR environment must serve cleaned
const ssrCleanTestPaths = new Set<string>();

const stripQuery = (id: string) => id.split("?")[0];

const renderSSRCommand: ComponentFormat = async (
	ctx,
	componentPath: string,
	componentName: string,
	props: Record<string, unknown> = {},
) => {
	const projectRoot = process.cwd();
	const absoluteComponentPath = resolve(projectRoot, componentPath);
	const viteServer = ctx.project.vite;

	const componentModule = await viteServer.ssrLoadModule(absoluteComponentPath);
	const Component = componentModule[componentName];

	if (!Component) {
		throw new Error(
			`Component "${componentName}" not found in ${absoluteComponentPath}`,
		);
	}

	return await renderComponentToSSR(ctx, Component, props);
};

const renderSSRLocalCommand: LocalComponentFormat = async (
	ctx,
	testFilePath: string,
	componentName: string,
	props: Record<string, unknown> = {},
) => {
	const viteServer = ctx.project.vite;

	// Segment hashes are path-salted: SSR must load the client id
	ssrCleanTestPaths.add(stripQuery(testFilePath));
	const componentModule = await viteServer.ssrLoadModule(testFilePath);
	const Component = componentModule[componentName];

	if (!Component) {
		throw new Error(
			`[vitest-browser-qwik]: Local component "${componentName}" not found in ${testFilePath}. Available exports: ${Object.keys(componentModule).join(", ")}`,
		);
	}

	return await renderComponentToSSR(ctx, Component, props);
};

/** Strips vitest-only code so a test module survives ssrLoadModule. */
function cleanTestModuleForSSR(
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

export function testSSR(): Plugin {
	return {
		name: "vitest:ssr-transform",
		enforce: "pre",

		config(config) {
			if (config.define) {
				userDefines = {
					...userDefines,
					...(config.define as Record<string, string>),
				};
			}
		},

		transform: {
			filter: {
				id: isJSorTS,
				code: /renderSSR/,
			},
			async handler(code, id) {
				const environmentName = this?.environment?.name;
				if (environmentName && environmentName !== "client") {
					if (!ssrCleanTestPaths.has(stripQuery(id))) return null;
					return cleanTestModuleForSSR(id, code);
				}

				const ast = parseSync(id, code);
				if (!hasRenderSSRCallInAST(ast.program, code)) return null;

				const s = new MagicString(code);
				const componentImports = new Map<string, string>();
				const localComponents = new Map<string, string>();
				const renderSSRIdentifiers = new Set<string>(["renderSSR"]);
				let hasExistingCommandsImport = false;

				function walkForTransformation(node: Node): undefined {
					if (
						isImportDeclaration(node) &&
						node.source?.value &&
						node.specifiers
					) {
						const source = node.source.value;
						for (const spec of node.specifiers) {
							if (
								spec.type === "ImportSpecifier" &&
								spec.imported.type === "Identifier"
							) {
								componentImports.set(spec.imported.name, source);
								if (spec.imported.name === "renderSSR") {
									renderSSRIdentifiers.add(spec.local.name);
								}
							} else if (
								spec.type === "ImportDefaultSpecifier" &&
								spec.local.name.toLowerCase().includes("renderssr")
							) {
								renderSSRIdentifiers.add(spec.local.name);
							}
						}
					}

					if (isVariableDeclarator(node)) {
						if (
							node.id.type === "Identifier" &&
							node.init?.type === "Identifier" &&
							renderSSRIdentifiers.has(node.init.name)
						) {
							renderSSRIdentifiers.add(node.id.name);
						}

						if (
							node.id.type === "Identifier" &&
							node.init?.type === "CallExpression"
						) {
							const callExpr = node.init;
							if (
								callExpr.callee.type === "Identifier" &&
								callExpr.callee.name === "component$"
							) {
								const fullDeclaration = code.slice(node.start, node.end);
								localComponents.set(node.id.name, fullDeclaration);
							}
						}
					}

					if (hasCommandsImport(node)) {
						hasExistingCommandsImport = true;
					}

					if (
						isCallExpression(node) &&
						node.callee.type === "Identifier" &&
						renderSSRIdentifiers.has(node.callee.name)
					) {
						const jsxArg = node.arguments?.[0];
						if (
							!isJSXElement(jsxArg) ||
							jsxArg.openingElement?.name?.type !== "JSXIdentifier"
						) {
							traverseChildren(node, walkForTransformation);
							return;
						}

						const componentName = jsxArg.openingElement.name.name;
						const props = extractPropsFromJSX(
							jsxArg.openingElement.attributes || [],
							code,
						);

						let propsStr = "";
						if (Object.keys(props).length > 0) {
							const propsEntries = Object.entries(props).map(
								([key, value]) => `${JSON.stringify(key)}: ${value}`,
							);
							propsStr = `, { ${propsEntries.join(", ")} }`;
						}

						const localComponentCode = localComponents.get(componentName);
						if (localComponentCode) {
							const replacement = `(async () => {
								const { html } = await commands.renderSSRLocal("${id}", "${componentName}"${propsStr});
								return renderServerHTML(html);
							})()`;
							s.overwrite(node.start, node.end, replacement);
						} else {
							const componentImportPath = componentImports.get(componentName);
							if (componentImportPath) {
								const componentPath = resolveComponentPath(
									componentImportPath,
									id,
								);
								const replacement = `(async () => {
									const { html } = await commands.renderSSR("${componentPath}", "${componentName}"${propsStr});
									return renderServerHTML(html);
								})()`;
								s.overwrite(node.start, node.end, replacement);
							}
						}
					}

					traverseChildren(node, walkForTransformation);
					return undefined;
				}

				walkForTransformation(ast.program);

				if (s.hasChanged()) {
					if (!hasExistingCommandsImport) {
						let lastImportEnd = 0;

						function findLastImport(node: Node): undefined {
							if (isImportDeclaration(node)) {
								lastImportEnd = Math.max(lastImportEnd, node.end);
							}
							traverseChildren(node, findLastImport);
							return undefined;
						}

						findLastImport(ast.program);

						if (lastImportEnd > 0) {
							s.appendLeft(
								lastImportEnd,
								'\nimport { commands } from "vitest/browser";\nimport { renderServerHTML } from "vitest-browser-qwik";',
							);
						}
					}

					if (localComponents.size > 0) {
						const localComponentNames = Array.from(localComponents.keys());
						const exportStatement = `\n\n// Auto-generated exports for local components\nexport { ${localComponentNames.join(", ")} };`;
						s.append(exportStatement);
					}

					return {
						code: s.toString(),
						map: s.generateMap({ hires: true }),
					};
				}

				return null;
			},
		},
		configResolved(config) {
			if (!config.define) {
				(config as { define: Record<string, string> }).define = {};
			}
			for (const [key, value] of Object.entries(userDefines)) {
				if (config.define) {
					config.define[key] = value;
				}
			}
			for (const [key, value] of Object.entries(config.env)) {
				if (config.define) {
					config.define[`__vite_ssr_import_meta__.env.${key}`] =
						JSON.stringify(value);
				}
			}

			if (config.test?.browser?.enabled) {
				config.test.browser.commands = {
					...config.test.browser.commands,
					renderSSR: renderSSRCommand,
					renderSSRLocal: renderSSRLocalCommand,
				};
			}
		},
	};
}
