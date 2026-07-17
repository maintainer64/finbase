import {Clock3} from "lucide-solid";
import {Component, createMemo} from "solid-js";
import {DatePicker} from "@/components/ui/date-picker";
import {toDateTimeValue, toDateValue} from "@/shared/date";

interface DateTimePickerProps {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}

const currentTime = (): string => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
};

export const DateTimePicker: Component<DateTimePickerProps> = (props) => {
    const date = createMemo(() => toDateValue(props.value));
    const time = createMemo(() => props.value.match(/T(\d{2}:\d{2})/)?.[1] ?? "");

    const changeDate = (nextDate: string) => {
        if (!nextDate) {
            props.onChange("");
            return;
        }
        props.onChange(`${nextDate}T${time() || currentTime()}`);
    };

    const changeTime = (nextTime: string) => {
        const nextDate = date() || toDateTimeValue(new Date().toISOString()).slice(0, 10);
        props.onChange(`${nextDate}T${nextTime || "00:00"}`);
    };

    return (
        <div class="grid grid-cols-[minmax(0,1fr)_8.5rem] gap-2">
            <DatePicker
                value={date()}
                onChange={changeDate}
                placeholder="Выберите дату"
                disabled={props.disabled}
            />
            <label class="relative">
                <Clock3 size={16} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                <input
                    type="time"
                    step="60"
                    value={time()}
                    disabled={props.disabled}
                    aria-label="Время операции"
                    class="min-h-10 w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-2 text-sm text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
                    onInput={(event) => changeTime(event.currentTarget.value)}
                />
            </label>
        </div>
    );
};
