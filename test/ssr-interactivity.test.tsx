import { component$, useSignal } from "@qwik.dev/core";
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderSSR } from "../src";
import { SSRButton } from "./fixtures/SSRButton";

test("imported component resumes and re-renders after click", async () => {
	const screen = await renderSSR(<SSRButton />);

	const button = screen.getByTestId("ssr-button");
	await expect.element(button).toHaveTextContent("count: 0");

	await button.click();
	await expect.element(button).toHaveTextContent("count: 1");
});

test("imported component with props resumes and re-renders after click", async () => {
	const screen = await renderSSR(<SSRButton initialCount={5} />);

	const button = screen.getByTestId("ssr-button");
	await expect.element(button).toHaveTextContent("count: 5");

	await button.click();
	await expect.element(button).toHaveTextContent("count: 6");
});

const LocalSSRButton = component$(() => {
	const count = useSignal(0);

	return (
		<button
			type="button"
			data-testid="local-ssr-button"
			onClick$={() => count.value++}
		>
			count: {count.value}
		</button>
	);
});

test("local component resumes and re-renders after click", async () => {
	const screen = await renderSSR(<LocalSSRButton />);

	const button = screen.getByTestId("local-ssr-button");
	await expect.element(button).toHaveTextContent("count: 0");

	await button.click();
	await expect.element(button).toHaveTextContent("count: 1");
});

const ButtonA = component$(() => {
	const count = useSignal(0);
	return (
		<button type="button" data-testid="btn-a" onClick$={() => count.value++}>
			a: {count.value}
		</button>
	);
});

const ButtonB = component$(() => {
	const count = useSignal(0);
	return (
		<button type="button" data-testid="btn-b" onClick$={() => count.value++}>
			b: {count.value}
		</button>
	);
});

test("two live SSR containers on one page stay independently interactive", async () => {
	await renderSSR(<ButtonA />);
	const a = page.getByTestId("btn-a");
	await a.click();
	await expect.element(a).toHaveTextContent("a: 1");

	// Resuming a second container must not break the first (shared document,
	// core only processes vnode refs once per page).
	await renderSSR(<ButtonB />);
	const b = page.getByTestId("btn-b");
	await b.click();
	await expect.element(b).toHaveTextContent("b: 1");

	await a.click();
	await expect.element(a).toHaveTextContent("a: 2");
});
