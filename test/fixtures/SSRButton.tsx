import { component$, useSignal } from "@qwik.dev/core";

// Only imported by ssr-interactivity.test.tsx: resume must work without
// another test warming the client module graph with this file first.
export const SSRButton = component$<{ initialCount?: number }>(
	({ initialCount = 0 }) => {
		const count = useSignal(initialCount);

		return (
			<button
				type="button"
				data-testid="ssr-button"
				onClick$={() => count.value++}
			>
				count: {count.value}
			</button>
		);
	},
);
