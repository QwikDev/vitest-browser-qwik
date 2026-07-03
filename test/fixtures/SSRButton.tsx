import { component$, useSignal } from "@qwik.dev/core";

// Keep imported only by ssr-interactivity.test.tsx: repro needs cold module graph
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
