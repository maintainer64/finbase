import {Component, JSX} from "solid-js";

interface LabelProps {
    for?: string;
    children: JSX.Element;
    class?: string;
}

export const Label: Component<LabelProps> = (props) => {
    return (
        <label
            for={props.for}
            class={`block text-sm font-medium text-gray-700 mb-2 ${props.class || ""}`}
        >
            {props.children}
        </label>
    );
};