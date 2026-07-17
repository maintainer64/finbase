import {Component, JSX} from "solid-js";

export const Space: Component<{children?: JSX.Element; class?: string}> = (props) => (
    <section class={`surface-card ${props.class ?? ""}`}>{props.children}</section>
);
