import { component$, useSignal } from "@qwik.dev/core";
import { expect, test } from "vitest";
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
