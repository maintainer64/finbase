import type {CustomThemeProps, SolidIconsConfig} from "@simple-table/solid";
import {
    ArrowDown,
    ArrowUp,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Filter,
    GripVertical,
    PanelLeft,
    PanelRight,
} from "lucide-solid";

const iconProps = {size: 14, strokeWidth: 2} as const;

/** Lucide controls keep data-grid chrome consistent with the rest of Finbase. */
export const simpleTableIcons: SolidIconsConfig = {
    sortUp: <ArrowUp {...iconProps}/>,
    sortDown: <ArrowDown {...iconProps}/>,
    filter: <Filter {...iconProps}/>,
    expand: <ChevronRight {...iconProps}/>,
    headerExpand: <ChevronRight {...iconProps}/>,
    headerCollapse: <ChevronDown {...iconProps}/>,
    prev: <ChevronLeft {...iconProps}/>,
    next: <ChevronRight {...iconProps}/>,
    drag: <GripVertical {...iconProps}/>,
    pinnedLeftIcon: <PanelLeft {...iconProps}/>,
    pinnedRightIcon: <PanelRight {...iconProps}/>,
};

export const compactTableTheme: CustomThemeProps = {
    rowHeight: 44,
    headerHeight: 44,
};
