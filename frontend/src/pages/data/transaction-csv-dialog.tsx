import {Component, createMemo, For, Show} from "solid-js";
import {AlertTriangle, CheckCircle2, Download, Upload, X} from "lucide-solid";
import {FaSolidSpinner} from "solid-icons/fa";
import {downloadFile} from "@/shared/utils";
import {TRANSACTION_CSV_EXAMPLE, type TransactionCsvIssue, type TransactionCsvPreview} from "./transaction-csv";
import {SimpleTable, type SolidColumnDef} from "@simple-table/solid";
import {compactTableTheme, simpleTableIcons} from "@/components/ui/simple-table";

export const downloadTransactionCsvExample = () => downloadFile(
    "finbase-transactions-import.csv",
    TRANSACTION_CSV_EXAMPLE,
    {type: "text/csv", addBOM: true},
);

interface CsvPreviewGridRow {
    line: number;
    date: string;
    account: string;
    note: string;
    categoryTags: string;
    amount: number;
    currency: string;
}

const CsvPreviewGrid: Component<{preview: TransactionCsvPreview}> = (props) => {
    const rows = createMemo<CsvPreviewGridRow[]>(() => props.preview.rows.slice(0, 20).map(row => ({
        line: row.line,
        date: String(row.transaction.date ?? "").slice(0, 10),
        account: row.source.account,
        note: row.source.note || "—",
        categoryTags: `${row.source.category || "Без категории"}${row.source.tags ? ` · ${row.source.tags}` : ""}`,
        amount: Number(row.transaction.amount ?? 0),
        currency: String(row.transaction.currency ?? ""),
    })));
    const columns = createMemo<SolidColumnDef<CsvPreviewGridRow>[]>(() => [
        {accessor: "line", label: "Строка", width: 76, type: "number", sortable: true},
        {accessor: "date", label: "Дата", width: "auto", maxWidth: 130, type: "date", sortable: true, filterable: true},
        {
            accessor: "account",
            label: "Счёт",
            width: "auto",
            minWidth: 150,
            maxWidth: 240,
            type: "enum",
            sortable: true,
            filterable: true,
            enumOptions: [...new Set(rows().map(row => row.account))].map(value => ({label: value, value})),
        },
        {accessor: "note", label: "Описание", width: "auto", minWidth: 180, maxWidth: 300, type: "string", sortable: true, filterable: true},
        {accessor: "categoryTags", label: "Категория / теги", width: "auto", minWidth: 180, maxWidth: 300, type: "string", sortable: true, filterable: true},
        {
            accessor: "amount",
            label: "Сумма",
            width: "auto",
            minWidth: 130,
            maxWidth: 180,
            type: "number",
            align: "right",
            sortable: true,
            filterable: true,
            valueFormatter: ({value, row}) => `${Number(value ?? 0).toLocaleString("ru-RU")} ${row.currency}`,
            useFormattedValueForClipboard: true,
            cellRenderer: ({row}) => (
                <span class={`whitespace-nowrap font-semibold tabular-nums ${row.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {row.amount.toLocaleString("ru-RU")} {row.currency}
                </span>
            ),
        },
    ]);

    return (
        <SimpleTable<CsvPreviewGridRow>
            columns={columns()}
            rows={rows()}
            getRowId={({row}) => row.line}
            maxHeight="360px"
            theme="custom"
            customTheme={compactTableTheme}
            icons={simpleTableIcons}
            autoExpandColumns
            columnResizing
            columnReordering
            hoverRowBackground
            hideFooter
            initialSortColumn="line"
            initialSortDirection="asc"
        />
    );
};

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
                        <CsvPreviewGrid preview={props.preview}/>
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
