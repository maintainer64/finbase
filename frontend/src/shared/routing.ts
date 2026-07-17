import {createSignal} from "solid-js";
import {TRoute} from "@/shared/types";

const ROUTES: TRoute[] = ["banks", "shops", "settings", "onboarding", "sync", "statistics", "data", "automation"];

/**
 * Разбирает hash-строку вида "#/statistics?accounts=a,b&period=3m".
 * Путь и query хранятся отдельными сигналами; query обновляется при hashchange.
 */
const parseHash = () => {
    const raw = window.location.hash.replace(/^#\/?/, "");
    const [path, query] = raw.split("?");
    return {
        path,
        params: new URLSearchParams(query ?? ""),
    };
};

const initial = parseHash();

export const [currentRoute, setCurrentRoute] = createSignal<TRoute>(
    ROUTES.includes(initial.path as TRoute) ? (initial.path as TRoute) : "banks"
);
export const [routeParams, setRouteParams] = createSignal<URLSearchParams>(initial.params);

export const navigateTo = (route: TRoute, params?: Record<string, string>) => {
    const query = params ? new URLSearchParams(params).toString() : "";
    window.location.hash = `/${route}${query ? `?${query}` : ""}`;
    setCurrentRoute(route);
    setRouteParams(new URLSearchParams(query));
};

window.addEventListener('hashchange', () => {
    const {path, params} = parseHash();
    setCurrentRoute(ROUTES.includes(path as TRoute) ? (path as TRoute) : "banks");
    setRouteParams(params);
});
