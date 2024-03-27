//!native
//!nonstrict
//!optimize 2

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "@rbxts/react";
import objectIs from "./object-is";

interface Snapshot<T> {
	getSnapshot: () => T;
	value: T;
}

type SelectionReference<Selected> =
	| {
			hasValue: false;
			value: undefined;
	  }
	| {
			hasValue: true;
			value: Selected;
	  };

function checkFunction<T>(latestGetSnapshot: () => T, latestValue: T) {
	const nextValue = latestGetSnapshot();
	return !objectIs(latestValue, nextValue);
}
function checkIfSnapshotChanged<T>(snapshot: Snapshot<T>) {
	const latestGetSnapshot = snapshot.getSnapshot;
	const latestValue = snapshot.value;

	const [success, value] = pcall(checkFunction, latestGetSnapshot, latestValue);
	return success ? value : true;
}

export function useSyncExternalStore<T>(subscribe: (handler: () => void) => () => void, getSnapshot: () => T): T {
	const value = getSnapshot();
	const [{ inst }, forceUpdate] = useState({ inst: { getSnapshot, value } });

	function updateValueLayoutEffect() {
		inst.value = value;
		inst.getSnapshot = getSnapshot;
		if (checkIfSnapshotChanged(inst)) forceUpdate({ inst });
	}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useLayoutEffect(updateValueLayoutEffect, [subscribe, value, getSnapshot]);

	// if one of the functions errors, we can have the name
	// of the function in the stack trace by doing this
	function subscribeEffect() {
		if (checkIfSnapshotChanged(inst)) forceUpdate({ inst });

		function handleStoreChange() {
			if (checkIfSnapshotChanged(inst)) forceUpdate({ inst });
		}
		return subscribe(handleStoreChange);
	}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect(subscribeEffect, [subscribe]);
	return value;
}

export type Selector<Snapshot, Selected> = (snapshot: Snapshot) => Selected;
export type EqualityFunction<Selected> = (left: Selected, right: Selected) => boolean;

export function useSyncExternalStoreWithSelector<Snapshot, Selected>(
	subscribe: (onStoreChange: () => void) => () => void,
	getSnapshot: () => Snapshot,
	selector: Selector<Snapshot, Selected>,
	isEqual?: EqualityFunction<Selected>,
) {
	const selectionReference = useRef<SelectionReference<Selected> | undefined>(undefined);
	let selection: SelectionReference<Selected>;

	if (selectionReference.current === undefined)
		selectionReference.current = selection = { hasValue: false, value: undefined };
	else selection = selectionReference.current;

	const getSelection = useMemo(() => {
		let hasMemo = false;
		let memoizedSnapshot: Snapshot | undefined;
		let memoizedSelection: Selected | undefined;

		const memoizedSelector: Selector<Snapshot, Selected> = (nextSnapshot) => {
			if (!hasMemo) {
				hasMemo = true;
				memoizedSnapshot = nextSnapshot;

				const nextSelection = selector(nextSnapshot);
				if (isEqual !== undefined && selection.hasValue === true) {
					const currentSelection = selection.value;
					if (isEqual(currentSelection, nextSelection)) {
						memoizedSelection = currentSelection;
						return currentSelection;
					}
				}

				memoizedSelection = nextSelection;
				return nextSelection;
			}

			const previousSnapshot = memoizedSnapshot;
			const previousSelection = memoizedSelection!;
			if (objectIs(previousSnapshot, nextSnapshot)) return previousSelection as Selected;

			const nextSelection = selector(nextSnapshot);
			if (isEqual?.(previousSelection as Selected, nextSelection)) return previousSelection as Selected;

			memoizedSnapshot = nextSnapshot;
			memoizedSelection = nextSelection;
			return nextSelection;
		};

		const getSnapshotWithSelector = (): Selected => memoizedSelector(getSnapshot());
		return getSnapshotWithSelector;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [getSnapshot, selector, isEqual]);

	const value = useSyncExternalStore(subscribe, getSelection);
	function updateValueEffect() {
		selection.hasValue = true;
		selection.value = value;
	}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect(updateValueEffect, [value]);

	return value;
}
