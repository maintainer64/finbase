import {createRoot} from "solid-js";
import {describe, expect, it} from "vitest";
import {useUniversalStorage} from "@/shared/hooks/useUniversalStorage";

class MemoryStorage {
    private readonly values = new Map<string, string>();

    getItem(key: string): string | null {
        return this.values.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.values.set(key, value);
    }
}

describe("универсальное хранилище", () => {
    it("сохраняет setter после уничтожения создавшего его Solid owner", () => {
        const storage = new MemoryStorage();
        Object.defineProperty(globalThis, "localStorage", {value: storage, configurable: true});

        let setToken: (value: string) => void = () => undefined;
        let dispose: () => void = () => undefined;
        createRoot((rootDispose) => {
            dispose = rootDispose;
            [, setToken] = useUniversalStorage("finbase-token", "");
        });

        dispose();
        setToken("pocketbase.jwt.token");

        expect(storage.getItem("finbase-token")).toBe(JSON.stringify("pocketbase.jwt.token"));
    });
});
