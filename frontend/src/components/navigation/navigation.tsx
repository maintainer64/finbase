import {NavItem} from "./nav-item";
import {FaSolidBuildingColumns, FaSolidCartShopping, FaSolidChartLine, FaSolidDatabase, FaSolidGear, FaSolidWallet} from "solid-icons/fa";
import {Show} from "solid-js";
import {openFinbaseTab} from "@/shared/open-finbase";
import {WandSparkles} from "lucide-solid";
import {ThemeToggle} from "@/components/theme-toggle";

export const Navigation = (props: {fullScreen: boolean}) => {
    return (
        <nav class="app-navigation">
            <div class="app-navigation__inner">
                <button
                    type="button"
                    class="app-brand"
                    aria-label="Открыть Finbase в новой вкладке"
                    title="Открыть Finbase на весь экран"
                    onClick={() => openFinbaseTab("statistics")}
                >
                    <span class="app-brand__mark"><FaSolidWallet/></span>
                    <span class="app-brand__name">Finbase</span>
                </button>
            <ul class="app-navigation__items">
                <NavItem text="Банки" route="banks" icon={<FaSolidBuildingColumns/>}/>
                <NavItem text="Магазины" route="shops" icon={<FaSolidCartShopping/>}/>
                <Show when={props.fullScreen}>
                    <NavItem text="Обзор" route="statistics" icon={<FaSolidChartLine/>}/>
                    <NavItem text="Данные" route="data" icon={<FaSolidDatabase/>}/>
                    <NavItem text="Автоматика" route="automation" icon={<WandSparkles size={16}/>}/>
                </Show>
                <NavItem text="Настройки" route="settings" icon={<FaSolidGear/>}/>
            </ul>
            <ThemeToggle/>
            </div>
        </nav>
    )
}
