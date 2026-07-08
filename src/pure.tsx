import type { Component, JSXOutput, NoSerialize } from "@qwik.dev/core";
import * as qwikCore from "@qwik.dev/core";
import { inlinedQrl, noSerialize, render as qwikRender } from "@qwik.dev/core";
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
let qwikLoaderInjected = false;

function destroyContainer(container: HTMLElement) {
	// qDestroy resets core's per-page vnode-data state so the next render resumes cleanly.
	const qContainer = container.matches("[q\\:container]")
		? container
		: container.querySelector("[q\\:container]");
	(qContainer as { qDestroy?: () => void } | null)?.qDestroy?.();
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

// Runtime exports missing from core's public.d.ts
const { getDomContainer, componentQrl } = qwikCore as unknown as {
	getDomContainer?: (element: Element) => unknown;
	componentQrl: <P extends Record<string, unknown>>(
		qrl: unknown,
	) => Component<P>;
};

function resumeQwikContainer(container: HTMLElement) {
	const qContainer = container.querySelector("[q\\:container]");
	if (!qContainer || !getDomContainer) return;
	getDomContainer(qContainer);
}

export function renderServerHTML(
	html: string,
	{ container, baseElement }: SSRRenderOptions = {},
): RenderResult {
	const setup = setupContainer(baseElement, container);

	setHTMLWithScripts(setup.container, html);
	resumeQwikContainer(setup.container);

	return createRenderResult(setup.container, setup.baseElement);
}

export interface RenderHookResult<Result> {
	result: Result;
	unmount: () => void;
}

interface HookRunnerProps extends Record<string, unknown> {
	runner: NoSerialize<() => void>;
}

// componentQrl(inlinedQrl) works without the optimizer; the noSerialize runner
// prop dodges dev's eager capture check but would not survive serialization,
// so keep this CSR-only.
const TestHookComponent = componentQrl<HookRunnerProps>(
	inlinedQrl(({ runner }: HookRunnerProps) => {
		runner?.();
		return <div data-testid="hook-result"></div>;
	}, "TestHookComponent_render"),
);

export async function renderHook<Result>(
	hook: () => Result,
): Promise<RenderHookResult<Result>> {
	const resultContainer = { value: undefined as Result | undefined };
	let resolveRender: () => void;

	const renderPromise = new Promise<void>((resolve) => {
		resolveRender = resolve;
	});

	const runner = noSerialize(() => {
		resultContainer.value = hook();
		resolveRender();
	});

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
