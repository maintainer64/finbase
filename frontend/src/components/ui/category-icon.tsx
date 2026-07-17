import {Component, For, Show} from "solid-js";
import {Dynamic} from "solid-js/web";
import {
    Ambulance, Award, BadgeDollarSign, BarChart3, Bath, BedSingle, Bike, Cake,
    Calculator, Car, Cat, ChartLine, CircleQuestionMark, Coffee, Dices, Drama,
    Drill, Droplet, Film, Flame, Flower, Fuel, Gamepad2, GraduationCap, HandHeart,
    Headphones, HeartHandshake, House, IceCreamCone, Martini, Phone, Pill, Plane,
    Shapes, ShieldPlus, Shirt, ShoppingBasket, ShoppingCart, Smartphone, Sparkles,
    Thermometer, Ticket, Train, TreePalm, Trophy, Truck, Unplug, Users, Wallet,
    type LucideIcon,
} from "lucide-solid";

/** Stable Lucide keys stored verbatim in PocketBase. */
const ICONS = {
    "heart-handshake": HeartHandshake,
    plane: Plane,
    drama: Drama,
    train: Train,
    flower: Flower,
    "shopping-basket": ShoppingBasket,
    house: House,
    pill: Pill,
    shapes: Shapes,
    fuel: Fuel,
    cat: Cat,
    "bar-chart-3": BarChart3,
    "badge-dollar-sign": BadgeDollarSign,
    shirt: Shirt,
    bike: Bike,
    users: Users,
    coffee: Coffee,
    bath: Bath,
    headphones: Headphones,
    ambulance: Ambulance,
    "ice-cream-cone": IceCreamCone,
    phone: Phone,
    sparkles: Sparkles,
    truck: Truck,
    martini: Martini,
    "shield-plus": ShieldPlus,
    thermometer: Thermometer,
    "chart-line": ChartLine,
    "shopping-cart": ShoppingCart,
    "bed-single": BedSingle,
    droplet: Droplet,
    "gamepad-2": Gamepad2,
    film: Film,
    ticket: Ticket,
    award: Award,
    cake: Cake,
    flame: Flame,
    "graduation-cap": GraduationCap,
    calculator: Calculator,
    unplug: Unplug,
    drill: Drill,
    dices: Dices,
    "tree-palm": TreePalm,
    wallet: Wallet,
    car: Car,
    "hand-heart": HandHeart,
    smartphone: Smartphone,
    trophy: Trophy,
} satisfies Record<string, LucideIcon>;

export type CategoryIconName = keyof typeof ICONS;
export const CATEGORY_ICON_OPTIONS = Object.keys(ICONS) as CategoryIconName[];

export const CategoryIcon: Component<{name?: string; class?: string; size?: number}> = (props) => {
    const icon = () => ICONS[props.name as CategoryIconName] ?? CircleQuestionMark;
    return (
        <span class={`inline-flex items-center justify-center ${props.class ?? ""}`}>
            <Dynamic component={icon()} size={props.size ?? 17} strokeWidth={2}/>
        </span>
    );
};

export const CategoryIconPicker: Component<{
    value: string;
    onChange: (value: string) => void;
}> = (props) => (
    <div class="grid grid-cols-8 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-2 sm:grid-cols-10">
        <For each={CATEGORY_ICON_OPTIONS}>
            {(name) => (
                <button
                    type="button"
                    title={name}
                    aria-label={`Иконка ${name}`}
                    class={`flex aspect-square items-center justify-center rounded-lg transition-colors ${
                        props.value === name
                            ? "bg-blue-600 text-white shadow-sm"
                            : "bg-white text-slate-500 hover:bg-blue-50 hover:text-blue-600"
                    }`}
                    onClick={() => props.onChange(name)}
                >
                    <CategoryIcon name={name}/>
                </button>
            )}
        </For>
        <Show when={props.value && !CATEGORY_ICON_OPTIONS.includes(props.value as CategoryIconName)}>
            <button
                type="button"
                title={props.value}
                class="flex aspect-square items-center justify-center rounded-lg bg-amber-500 text-white"
                onClick={() => props.onChange("")}
            >
                <CircleQuestionMark size={17}/>
            </button>
        </Show>
    </div>
);
