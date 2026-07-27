import { component$, useSignal } from "@qwik.dev/core";
import { expect, test } from "vitest";
import { render } from "../src";

const FocusButton = component$(() => {
	const focused = useSignal(false);
	return (
		<button
			type="button"
			data-testid="btn"
			onFocus$={() => {
				focused.value = true;
			}}
			onBlur$={() => {
				focused.value = false;
			}}
		>
			focused: {`${focused.value}`}
		</button>
	);
});

// afterEach cleanup removes the focused button → blur fires → onBlur$ QRL runs
// getDomContainer. If qDestroy stripped q:container from this CSR container first,
// that throws Code(Q24) as an unhandled rejection and fails the run.
test("cleanup of a focused container does not throw Code(Q24)", async () => {
	const screen = await render(<FocusButton />);
	await screen.getByTestId("btn").click();
	await expect
		.element(screen.getByTestId("btn"))
		.toHaveTextContent("focused: true");
});
