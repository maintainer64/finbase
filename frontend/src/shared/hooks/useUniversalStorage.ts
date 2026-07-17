import {createSignal} from 'solid-js';


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

    const persist = (next: T) => {
        try {
            const serialized = serialize(next);
            localStorage.setItem(key, serialized);
            setError('');
            setIsPersistent(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
            setIsPersistent(false);
        }
    };

    const updateValue = (newValue: T | ((prev: T) => T)) => {
        const next = typeof newValue === 'function'
            ? (newValue as (prev: T) => T)(value())
            : newValue;
        // Пишем сразу, а не через createEffect: store кэшируется между экранами,
        // тогда как владелец первого Solid-компонента может быть уже уничтожен.
        persist(next);
        setValue(() => next);
    };

    return [value, updateValue, isPersistent, error, isInitialStateResolved];
}
