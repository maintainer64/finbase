// UI-метаданные для моделей из shared/finbase/models.ts. Здесь нет второго
// набора типов данных: только подписи и способ отображения конкретного PB-поля.
import {WritableCollectionName} from "@/shared/finbase/models";

export type FieldKind = "text" | "textarea" | "number" | "date" | "select" | "relation" | "relation-many" | "color" | "icon";

export interface FieldSpec {
    name: string;
    label: string;
    kind: FieldKind;
    required?: boolean;
    options?: string[];
    relation?: string;
    listable?: boolean;
    readonly?: boolean;
}

export interface CollectionSpec {
    collection: WritableCollectionName;
    label: string;
    plural: string;
    fields: FieldSpec[];
    /** Поле, по которому показываем записи этой коллекции в relation-списках. */
    displayField: string;
}

export const COLLECTIONS: CollectionSpec[] = [
    {
        collection: "accounts",
        label: "Счёт",
        plural: "Счета",
        displayField: "name",
        fields: [
            {name: "name", label: "Название", kind: "text", required: true, listable: true},
            {name: "type", label: "Тип", kind: "select", required: true, listable: true, options: ["checking", "savings", "cash", "credit"]},
            {name: "owner", label: "Пользователь", kind: "relation", relation: "users", listable: true},
            {name: "balance", label: "Баланс (считается автоматически)", kind: "number", listable: true, readonly: true},
            {name: "currency", label: "Валюта", kind: "text", required: true},
            {name: "external_id", label: "Внешний id", kind: "text", listable: true},
            {name: "provider_code", label: "Провайдер", kind: "text", listable: true},
            {name: "accountable_type", label: "Тип у провайдера", kind: "text"},
            {name: "accountable_id", label: "Id у провайдера", kind: "text"},
            {name: "notes", label: "Заметки", kind: "textarea"},
            {name: "disabled_at", label: "Отключён", kind: "date", listable: true},
            {name: "excluded_report_at", label: "Скрыт из отчётов", kind: "date", listable: true},
        ],
    },
    {
        collection: "categories",
        label: "Категория",
        plural: "Категории",
        displayField: "name",
        fields: [
            {name: "name", label: "Название", kind: "text", required: true, listable: true},
            {name: "color", label: "Цвет", kind: "color", listable: true},
            {name: "parent_category", label: "Родительская", kind: "relation", relation: "categories", listable: true},
            {name: "lucide_icon", label: "Lucide", kind: "icon", listable: true},
        ],
    },
    {
        collection: "tags",
        label: "Тег",
        plural: "Теги",
        displayField: "name",
        fields: [
            {name: "name", label: "Название", kind: "text", required: true, listable: true},
            {name: "icon", label: "Иконка", kind: "icon", listable: true},
            {name: "color", label: "Цвет", kind: "color", listable: true},
        ],
    },
    {
        collection: "transactions",
        label: "Операция",
        plural: "Операции",
        displayField: "note",
        fields: [
            {name: "account", label: "Счёт", kind: "relation", required: true, relation: "accounts", listable: true},
            {name: "category", label: "Категория", kind: "relation", relation: "categories", listable: true},
            {name: "tags", label: "Теги", kind: "relation-many", relation: "tags", listable: true},
            {name: "date", label: "Дата", kind: "date", required: true, listable: true},
            {name: "amount", label: "Сумма", kind: "number", listable: true},
            {name: "currency", label: "Валюта", kind: "text", required: true},
            {name: "note", label: "Описание", kind: "textarea", listable: true},
            {name: "external_id", label: "Внешний id", kind: "text"},
        ],
    },
    {
        collection: "transfers",
        label: "Перевод",
        plural: "Переводы",
        displayField: "notes",
        fields: [
            {name: "inflow_transaction", label: "Операция прихода", kind: "relation", required: true, relation: "transactions", listable: true},
            {name: "outflow_transaction", label: "Операция расхода", kind: "relation", required: true, relation: "transactions", listable: true},
            {name: "status", label: "Статус", kind: "select", required: true, options: ["pending", "accepted", "rejected"], listable: true},
            {name: "notes", label: "Заметки", kind: "textarea"},
        ],
    },
];
