/* @refresh reload */
import { render } from "solid-js/web";

import "@simple-table/solid/styles.css";
import "./index.css";
import { App } from "@/app/app";

const root = document.getElementById('root');

if (root instanceof HTMLElement) {
  render(() => <App />, root);
}
