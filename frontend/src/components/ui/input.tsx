import {Component} from "solid-js";

interface InputProps {
    id?: string;
    value: string;
    placeholder?: string;
    type?: "text" | "password" | "email" | "date" | "number";
    onChange: (value: string) => void;
    class?: string;
}

export const Input: Component<InputProps> = (props) => {
    return (
        <input
            id={props.id}
            type={props.type || "text"}
            value={props.value}
            placeholder={props.placeholder}
            onInput={(e) => props.onChange(e.currentTarget.value)}
            class={`w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white text-gray-900 placeholder-gray-500 ${
                props.class || ""
            }`}
        />
    );
};