import type { JSXOutput } from "@qwik.dev/core";
import { inlinedQrl, render as qwikRender } from "@qwik.dev/core";
import { componentQrl, getDomContainer } from "@qwik.dev/core/internal";
import { getQwikLoaderScript } from "@qwik.dev/core/server";
import type { Locator, LocatorSelectors } from "vitest/browser";
import { type PrettyDOMOptions, utils } from "vitest/browser";

const { debug, getElementLocatorSelectors } = utils;

export interface RenderResult extends LocatorSelectors {
	container: HTMLElement;
	baseElement: HTMLElement;
	debug: (
		el?: HTMLElement | HTMLElement[] | Locator | Locator[],
		maxLength?: number,
		options?: PrettyDOMOptions,
	) => void;
	unmount: () => void;
	asFragment: () => DocumentFragment;
}

export interface RenderOptions {
	container?: HTMLElement;
	baseElement?: HTMLElement;
}

export interface SSRRenderOptions {
	container?: HTMLElement;
	baseElement?: HTMLElement;
}

const mountedContainers = new Set<HTMLElement>();
// Only SSR-resumed containers carry per-page vnode-data state that qDestroy must
// reset; CSR renders don't, and qDestroy there would strip q:container before
// teardown blur handlers resolve (Code(Q24)).
const ssrContainers = new WeakSet<HTMLElement>();
let qwikLoaderInjected = false;

function findQwikContainer(container: HTMLElement): Element | null {
	return container.querySelector("[q\\:container]");
}

function destroyContainer(container: HTMLElement) {
	if (ssrContainers.has(container)) {
		const qContainer = findQwikContainer(container);
		(qContainer as { qDestroy?: () => void } | null)?.qDestroy?.();
	}
	container.innerHTML = "";
	mountedContainers.delete(container);
	if (container.parentNode === document.body) {
		document.body.removeChild(container);
	}
}

function csrQwikLoader() {
	if (qwikLoaderInjected) return;

	const script = document.createElement("script");
	script.innerHTML = getQwikLoaderScript();
	document.head.appendChild(script);
	qwikLoaderInjected = true;
}

function createRenderResult(
	container: HTMLElement,
	baseElement: HTMLElement,
): RenderResult {
	mountedContainers.add(container);

	const unmount = () => {
		destroyContainer(container);
	};

	return {
		container,
		baseElement,
		debug: (el, maxLength, options) => debug(el, maxLength, options),
		unmount,
		asFragment: () => {
			return document
				.createRange()
				.createContextualFragment(container.innerHTML);
		},
		...getElementLocatorSelectors(baseElement),
	};
}

function setupContainer(
	baseElement?: HTMLElement,
	container?: HTMLElement,
): { container: HTMLElement; baseElement: HTMLElement } {
	if (!baseElement) {
		baseElement = document.body;
	}

	if (!container) {
		container = baseElement.appendChild(document.createElement("div"));
	}

	return { container, baseElement };
}

export async function render(
	ui: JSXOutput,
	{ container, baseElement }: RenderOptions = {},
): Promise<RenderResult> {
	csrQwikLoader();

	const setup = setupContainer(baseElement, container);
	await qwikRender(setup.container, ui);

	return createRenderResult(setup.container, setup.baseElement);
}

function setHTMLWithScripts(container: HTMLElement, html: string) {
	container.innerHTML = html;
	const scripts = container.querySelectorAll("script");

	// Recreate script tags to trigger execution
	scripts.forEach((oldScript) => {
		const newScript = document.createElement("script");

		for (const attr of Array.from(oldScript.attributes)) {
			newScript.setAttribute(attr.name, attr.value);
		}

		newScript.text = oldScript.textContent ?? "";

		oldScript.parentNode?.replaceChild(newScript, oldScript);
	});
}

function resumeQwikContainer(container: HTMLElement) {
	const qContainer = findQwikContainer(container);
	if (!qContainer) return;
	getDomContainer(qContainer);
}

export function renderServerHTML(
	html: string,
	{ container, baseElement }: SSRRenderOptions = {},
): RenderResult {
	const setup = setupContainer(baseElement, container);

	setHTMLWithScripts(setup.container, html);
	resumeQwikContainer(setup.container);
	ssrContainers.add(setup.container);

	return createRenderResult(setup.container, setup.baseElement);
}

export interface RenderHookResult<Result> {
	result: Result;
	unmount: () => void;
}

export async function renderHook<Result>(
	hook: () => Result,
): Promise<RenderHookResult<Result>> {
	const resultContainer = { value: undefined as Result | undefined };
	let resolveRender: () => void;

	const renderPromise = new Promise<void>((resolve) => {
		resolveRender = resolve;
	});

	const runner = () => {
		resultContainer.value = hook();
		resolveRender();
	};

	// The published dist is never optimizer-transformed, so component$'s $() would
	// throw at runtime; componentQrl(inlinedQrl) is core's manual-QRL escape hatch.
	// The hook rides in as a prop so it never enters the closure the optimizer serializes.
	const TestHookComponent = componentQrl<{ runner: () => void }>(
		inlinedQrl(({ runner }: { runner: () => void }) => {
			runner();
			return <div data-testid="hook-result"></div>;
		}, "TestHookComponent_render"),
	);

	const screen = await render(<TestHookComponent runner={runner} />);

	await renderPromise;

	// renderPromise only resolves after the runner ran, so the result is set
	// (and may legitimately be undefined).
	return {
		result: resultContainer.value as Result,
		unmount: () => {
			screen.unmount();
		},
	};
}

export async function cleanup(): Promise<void> {
	mountedContainers.forEach((container) => {
		destroyContainer(container);
	});
}
