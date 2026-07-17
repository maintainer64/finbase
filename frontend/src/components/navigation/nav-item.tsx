import {TRoute} from "@/shared/types";
import {currentRoute, navigateTo} from "@/shared/routing";
import {JSX} from "solid-js";

type TProps = {
  route: TRoute;
  text: string;
  icon?: JSX.Element | null;
};

const selectedStyle = "app-nav-item app-nav-item--active"
const defaultStyle = "app-nav-item"

export const NavItem = ({route, text, icon }: TProps) => {
  return (
    <li>
      <button
        type="button"
        class={currentRoute() === route ? selectedStyle : defaultStyle}
        onClick={() => navigateTo(route)}
      >
        <span class="app-nav-item__icon">{icon}</span> <span>{text}</span>
      </button>
    </li>
  )
}
