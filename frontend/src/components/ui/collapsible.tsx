import { Component, JSX, createSignal } from "solid-js";

interface CollapsibleProps {
    title: string;
    children: JSX.Element;
    defaultOpen?: boolean;
}

export const Collapsible: Component<CollapsibleProps> = (props) => {
    const [isOpen, setIsOpen] = createSignal(props.defaultOpen || false);

    return (
        <div class="border border-gray-200 rounded-lg overflow-hidden">
            <button
                onClick={() => setIsOpen(!isOpen())}
                class="w-full px-3 py-2 bg-gray-50 hover:bg-gray-100 flex justify-between items-center text-left transition-colors duration-200"
            >
                <span class="font-semibold text-gray-900">{props.title}</span>
                <svg
                    class={`w-5 h-5 text-gray-500 transform transition-transform duration-200 ${
                        isOpen() ? "rotate-180" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {isOpen() && (
                <div class="px-3 py-2 bg-white border-t border-gray-200">
                    {props.children}
                </div>
            )}
        </div>
    );
};