import {Component, For, Show} from "solid-js";
import {AlertTriangle, CheckCircle2, Download, Upload, X} from "lucide-solid";
import {FaSolidSpinner} from "solid-icons/fa";
import {downloadFile} from "@/shared/utils";
import {TRANSACTION_CSV_EXAMPLE, type TransactionCsvIssue, type TransactionCsvPreview} from "./transaction-csv";

export const downloadTransactionCsvExample = () => downloadFile(
    "finbase-transactions-import.csv",
    TRANSACTION_CSV_EXAMPLE,
    {type: "text/csv", addBOM: true},
);

export const TransactionCsvDialog: Component<{
    filename: string;
    preview: TransactionCsvPreview;
    importing: boolean;
    progress: {completed: number; total: number};
    importIssues: TransactionCsvIssue[];
    onImport: () => void;
    onClose: () => void;
}> = (props) => (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" onClick={() => props.onClose()}>
        <div class="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/60 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div class="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
                <div class="min-w-0">
                    <div class="text-xs font-semibold uppercase tracking-[.18em] text-blue-500">Импорт операций CSV</div>
                    <h2 class="mt-1 truncate text-xl font-semibold text-slate-900" title={props.filename}>{props.filename}</h2>
                    <p class="mt-1 text-xs text-slate-500">Счёт, категория и теги сопоставляются с PocketBase по полному названию без учёта регистра.</p>
                </div>
                <button class="flex size-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => props.onClose()} aria-label="Закрыть"><X size={19}/></button>
            </div>

            <div class="grid gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-4 sm:grid-cols-3">
                <div class="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <div class="text-xs text-slate-400">Строк в файле</div>
                    <div class="mt-1 text-xl font-semibold tabular-nums text-slate-900">{props.preview.totalRows}</div>
                </div>
                <div class="rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
                    <div class="text-xs text-emerald-700">Готовы к импорту</div>
                    <div class="mt-1 text-xl font-semibold tabular-nums text-emerald-700">{props.preview.rows.length}</div>
                </div>
                <div class="rounded-xl border border-rose-100 bg-rose-50/60 px-4 py-3">
                    <div class="text-xs text-rose-700">Строк с ошибками</div>
                    <div class="mt-1 text-xl font-semibold tabular-nums text-rose-700">{props.preview.issues.length + props.importIssues.length}</div>
                </div>
            </div>

            <div class="min-h-48 flex-1 overflow-auto p-5">
                <Show when={props.preview.issues.length > 0 || props.importIssues.length > 0}>
                    <div class="mb-5 overflow-hidden rounded-2xl border border-rose-200">
                        <div class="flex items-center gap-2 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700"><AlertTriangle size={16}/> Требуют исправления</div>
                        <div class="max-h-52 divide-y divide-rose-100 overflow-auto bg-white">
                            <For each={[...props.preview.issues, ...props.importIssues].slice(0, 100)}>{(issue) => (
                                <div class="px-4 py-2 text-xs text-slate-600"><b class="text-rose-600">Строка {issue.line}:</b> {issue.message}</div>
                            )}</For>
                        </div>
                    </div>
                </Show>

                <Show when={props.preview.rows.length > 0}>
                    <div class="overflow-hidden rounded-2xl border border-slate-200">
                        <div class="flex items-center justify-between bg-slate-50 px-4 py-3">
                            <span class="flex items-center gap-2 text-sm font-medium text-slate-700"><CheckCircle2 size={16} class="text-emerald-500"/> Предпросмотр корректных строк</span>
                            <span class="text-xs text-slate-400">Показаны первые {Math.min(20, props.preview.rows.length)}</span>
                        </div>
                        <div class="overflow-auto">
                            <table class="w-full min-w-[760px] text-xs">
                                <thead><tr class="border-t border-slate-200 bg-white text-left text-slate-400">
                                    <th class="px-3 py-2">Строка</th><th class="px-3 py-2">Дата</th><th class="px-3 py-2">Счёт</th><th class="px-3 py-2">Описание</th><th class="px-3 py-2">Категория / теги</th><th class="px-3 py-2 text-right">Сумма</th>
                                </tr></thead>
                                <tbody class="divide-y divide-slate-100">
                                <For each={props.preview.rows.slice(0, 20)}>{(row) => (
                                    <tr>
                                        <td class="px-3 py-2 text-slate-400">{row.line}</td>
                                        <td class="whitespace-nowrap px-3 py-2 text-slate-500">{String(row.transaction.date).slice(0, 10)}</td>
                                        <td class="max-w-48 truncate px-3 py-2 font-medium text-slate-700" title={row.source.account}>{row.source.account}</td>
                                        <td class="max-w-56 truncate px-3 py-2 text-slate-600" title={row.source.note}>{row.source.note || "—"}</td>
                                        <td class="max-w-52 truncate px-3 py-2 text-slate-500">{row.source.category || "Без категории"}{row.source.tags ? ` · ${row.source.tags}` : ""}</td>
                                        <td class={`whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums ${Number(row.transaction.amount) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{Number(row.transaction.amount).toLocaleString("ru-RU")} {row.transaction.currency}</td>
                                    </tr>
                                )}</For>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </Show>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
                <button type="button" class="secondary-button" onClick={downloadTransactionCsvExample}><Download size={15}/> Скачать пример CSV</button>
                <div class="flex items-center gap-3">
                    <Show when={props.importing}><span class="text-xs text-slate-500">{props.progress.completed} из {props.progress.total}</span></Show>
                    <button type="button" class="rounded-xl px-4 py-2 text-sm text-slate-600 hover:bg-slate-100" disabled={props.importing} onClick={() => props.onClose()}>Отмена</button>
                    <button type="button" class="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50" disabled={props.importing || props.preview.rows.length === 0} onClick={() => props.onImport()}>
                        <Show when={!props.importing} fallback={<FaSolidSpinner class="animate-spin"/>}><Upload size={16}/></Show>
                        Импортировать {props.preview.rows.length}
                    </button>
                </div>
            </div>
        </div>
    </div>
);
