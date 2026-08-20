import {createEffect, createSignal} from 'solid-js';


export function useUniversalStorage<T>(
    key: string,
    defaultValue: T,
    options?: {
        serialize?: (value: T) => string;
        deserialize?: (value: string) => T;
    }
): [() => T, (value: T | ((prev: T) => T)) => void, () => boolean, () => string, () => boolean] {
    const serialize = options?.serialize || JSON.stringify;
    const deserialize = options?.deserialize || JSON.parse;

    let initial = defaultValue;
    let persistent = false;
    let loadError = '';
    try {
        const stored = localStorage.getItem(key);
        if (stored !== null) {
            initial = deserialize(stored);
        }
        persistent = true;
    } catch (err) {
        loadError = err instanceof Error ? err.message : 'Unknown error';
    }

    const [value, setValue] = createSignal<T>(initial);
    const [isPersistent, setIsPersistent] = createSignal<boolean>(persistent);
    const [error, setError] = createSignal<string>(loadError);
    const [isInitialStateResolved] = createSignal<boolean>(true);

    createEffect(() => {
        try {
            const serialized = serialize(value());
            localStorage.setItem(key, serialized);
            setError('');
            setIsPersistent(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
            setIsPersistent(false);
        }
    });

    const updateValue = (newValue: T | ((prev: T) => T)) => {
        if (typeof newValue === 'function') {
            setValue(prev => (newValue as (prev: T) => T)(prev));
        } else {
            // @ts-expect-error new value
            setValue(newValue);
        }
    };

    return [value, updateValue, isPersistent, error, isInitialStateResolved];
}