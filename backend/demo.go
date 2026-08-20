package main

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/spf13/cobra"
)

type demoCategory struct {
	Name       string
	Color      string
	ParentName string
	Icon       string
}

var demoCategories = []demoCategory{
	{"Благотворительность", "#565656", "Пожертвование", "heart-handshake"},
	{"Авиабилеты", "#1B03EA", "Путешествия", "plane"},
	{"Театр", "#eb5429", "Развлечения", "drama"},
	{"ЖД билеты", "#1B03EA", "Путешествия", "train"},
	{"Парикмахерская", "#c44fe9", "Красота", "flower"},
	{"Готовая еда", "#D20A0A", "Еда", "shopping-basket"},
	{"Дом", "#e99537", "", "house"},
	{"Аптека", "#4da568", "Здоровье", "pill"},
	{"Хостинг", "#6ad28a", "Связь", "shapes"},
	{"Транспорт", "#61c9ea", "", "fuel"},
	{"Саймон", "#8B4CB5", "", "cat"},
	{"Связь", "#6ad28a", "", "bar-chart-3"},
	{"Общественный транспорт", "#61c9ea", "Транспорт", "train"},
	{"Кешбек и бонусы", "#df4e92", "", "badge-dollar-sign"},
	{"Проводной интернет", "#6ad28a", "Связь", "shapes"},
	{"Одежда", "#61c9ea", "Гардероб", "shirt"},
	{"Самокат", "#61c9ea", "Транспорт", "bike"},
	{"Семья", "#565656", "Пожертвование", "users"},
	{"Кафе", "#D20A0A", "Еда", "coffee"},
	{"Покупки для красоты", "#c44fe9", "Красота", "bath"},
	{"Музыка", "#805dee", "Хобби", "headphones"},
	{"Лечение", "#4da568", "Здоровье", "ambulance"},
	{"Обувь", "#61c9ea", "Гардероб", "shirt"},
	{"Вкусняшки", "#D20A0A", "Еда", "ice-cream-cone"},
	{"Мобильная связь", "#6ad28a", "Связь", "phone"},
	{"Красота", "#c44fe9", "", "sparkles"},
	{"Мебель для дома", "#e99537", "Дом", "truck"},
	{"Гардероб", "#61c9ea", "", "shirt"},
	{"Рестораны", "#D20A0A", "Еда", "martini"},
	{"Стоматология", "#4da568", "Здоровье", "shield-plus"},
	{"Здоровье", "#4da568", "", "thermometer"},
	{"Вложения", "#df4e92", "", "chart-line"},
	{"Супермаркет", "#D20A0A", "Еда", "shopping-cart"},
	{"Отели", "#1B03EA", "Путешествия", "bed-single"},
	{"Вода", "#D20A0A", "Еда", "droplet"},
	{"Компьютерные игры", "#805dee", "Хобби", "gamepad-2"},
	{"Кино", "#eb5429", "Развлечения", "film"},
	{"Автобусные билеты", "#1B03EA", "Путешествия", "ticket"},
	{"Хобби", "#805dee", "", "award"},
	{"Друзья", "#e99537", "", "cake"},
	{"Развлечения", "#eb5429", "", "flame"},
	{"КУ", "#e99537", "Дом", "house"},
	{"Образование", "#626D65", "", "graduation-cap"},
	{"Оплата труда", "#df4e92", "", "calculator"},
	{"Фитнес", "#805dee", "Хобби", "unplug"},
	{"Выпуск статей", "#626D65", "Образование", "graduation-cap"},
	{"Хозтовары для дома", "#e99537", "Дом", "drill"},
	{"Еда", "#D20A0A", "", "shopping-basket"},
	{"Подписки", "#6ad28a", "Связь", "dices"},
	{"Путешествия", "#1B03EA", "", "tree-palm"},
	{"Чаевые", "#565656", "Пожертвование", "wallet"},
	{"Такси", "#61c9ea", "Транспорт", "car"},
	{"Пожертвование", "#565656", "", "hand-heart"},
	{"Электроника", "#e99537", "", "smartphone"},
	{"Футбол", "#805dee", "Хобби", "trophy"},
	{"Аренда", "#e99537", "Дом", "house"},
}

type demoTag struct {
	Name  string
	Color string
	Icon  string
}

var demoTags = []demoTag{
	{"Регулярное", "#6366f1", "calculator"},
	{"Обязательное", "#ef4444", "shield-plus"},
	{"Отдых", "#0ea5e9", "tree-palm"},
	{"Семья", "#ec4899", "users"},
	{"Перевод", "#64748b", "wallet"},
}

type demoAccount struct {
	Key      string
	Name     string
	Type     string
	Owner    string
	Balance  float64
	Currency string
}

var demoAccounts = []demoAccount{
	{"checking", "Основной счёт", "checking", "alex", 125000, "RUB"},
	{"savings", "Накопительный", "savings", "alex", 480000, "RUB"},
	{"cash", "Наличные", "cash", "maria", 12000, "RUB"},
	{"credit", "Кредитная карта", "credit", "maria", -18000, "RUB"},
}

type demoUser struct {
	Key   string
	Name  string
	Email string
}

var demoUsers = []demoUser{
	{"alex", "Алексей", "alex@demo.invalid"},
	{"maria", "Мария", "maria@demo.invalid"},
}

type demoRule struct {
	Name            string
	TransactionType string
	Category        string
}

var demoRules = []demoRule{
	{"РЖД", "expense", "ЖД билеты"},
	{"Водоробот", "expense", "Вода"},
	{"Pekara By Petrovih", "expense", "Кафе"},
	{"Khatiko96", "expense", "Саймон"},
	{"Зачисление кэшбэка", "income", "Кешбек и бонусы"},
	{"Гипербола", "expense", "Супермаркет"},
	{"Выплата процентов", "income", "Вложения"},
	{"Yota +7 905 863-88-48", "expense", "Мобильная связь"},
	{"Проценты на остаток", "income", "Вложения"},
	{"Lanch I Zavtrak", "expense", "Кафе"},
	{"Пополнение через ООО \"Банк Точка\"", "income", "Оплата труда"},
	{"ДВА ДЕДА", "expense", "Рестораны"},
	{"IP Pitilimov", "expense", "Кафе"},
	{"IP Demchenko A A", "expense", "Парикмахерская"},
	{"Уральский федеральный университет УрФУ", "expense", "Выпуск статей"},
	{"МТС Mobile +7 912 036-73-82", "expense", "Проводной интернет"},
	{"DDX FITNESS", "expense", "Фитнес"},
	{"Яндекс Лавка", "expense", "Готовая еда"},
	{"Le Petit Delice", "expense", "Кафе"},
	{"Mk Paracels.", "expense", "Стоматология"},
	{"МТС Юрент", "expense", "Самокат"},
	{"Такси", "expense", "Такси"},
	{"Самокаты", "expense", "Самокат"},
	{"Пятёрочка", "expense", "Еда"},
	{"Кэшбэк за обычные покупки", "income", "Кешбек и бонусы"},
	{"Жизньмарт", "expense", "Готовая еда"},
	{"Екатеринбургский транспорт", "expense", "Общественный транспорт"},
	{"Яндекс Плюс", "expense", "Подписки"},
	{"Engels", "expense", "Рестораны"},
	{"Екатеринбургский Метрополитен", "expense", "Общественный транспорт"},
	{"Авиабилеты в Т-Путешествиях", "expense", "Авиабилеты"},
	{"Лавка", "expense", "Готовая еда"},
	{"Перекрёсток", "expense", "Супермаркет"},
	{"Кировский", "expense", "Супермаркет"},
}

type demoTransaction struct {
	ExternalID string
	AccountKey string
	Category   string
	Tags       []string
	Date       time.Time
	Amount     float64
	Note       string
}

type demoSummary struct {
	Categories   int
	Tags         int
	Users        int
	Accounts     int
	Rules        int
	Transactions int
	Transfers    int
}

func registerDemoCommand(app *pocketbase.PocketBase) {
	days := 180
	command := &cobra.Command{
		Use:          "demo",
		Short:        "Fills Finbase collections with idempotent demo data",
		SilenceUsage: true,
		RunE: func(command *cobra.Command, _ []string) error {
			if err := validateDemoDays(days); err != nil {
				return err
			}
			if err := app.RunAppMigrations(); err != nil {
				return fmt.Errorf("apply Finbase schema: %w", err)
			}
			summary, err := seedDemo(app, days)
			if err != nil {
				return err
			}
			_, err = fmt.Fprintf(command.OutOrStdout(),
				"Demo ready: %d categories, %d tags, %d users, %d accounts, %d rules, %d transactions, %d transfers created.\n",
				summary.Categories, summary.Tags, summary.Users, summary.Accounts, summary.Rules, summary.Transactions, summary.Transfers,
			)
			return err
		},
	}
	command.Flags().IntVar(&days, "days", days, "number of recent days to generate (30-730)")
	app.RootCmd.AddCommand(command)
}

// registerDemoEnv enables the same idempotent seed during the regular serve
// command. This keeps the distroless image shell-free: no wrapper entrypoint or
// second PocketBase process is needed.
func registerDemoEnv(app *pocketbase.PocketBase) {
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		enabled, err := parseDemoEnabled(os.Getenv("FINBASE_DEMO"))
		if err != nil {
			return err
		}
		if !enabled {
			return e.Next()
		}

		days, err := parseDemoDays(os.Getenv("FINBASE_DEMO_DAYS"))
		if err != nil {
			return err
		}
		summary, err := seedDemo(app, days)
		if err != nil {
			return fmt.Errorf("seed Finbase demo data: %w", err)
		}
		log.Printf(
			"Finbase demo ready (%d days): %d categories, %d tags, %d users, %d accounts, %d rules, %d transactions, %d transfers created",
			days, summary.Categories, summary.Tags, summary.Users, summary.Accounts, summary.Rules, summary.Transactions, summary.Transfers,
		)
		return e.Next()
	})
}

func parseDemoEnabled(value string) (bool, error) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", "0", "false", "no", "off":
		return false, nil
	case "1", "true", "yes", "on":
		return true, nil
	default:
		return false, fmt.Errorf("FINBASE_DEMO must be true or false, got %q", value)
	}
}

func parseDemoDays(value string) (int, error) {
	if strings.TrimSpace(value) == "" {
		return 180, nil
	}
	days, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil {
		return 0, fmt.Errorf("FINBASE_DEMO_DAYS must be a number: %w", err)
	}
	if err := validateDemoDays(days); err != nil {
		return 0, fmt.Errorf("FINBASE_DEMO_DAYS: %w", err)
	}
	return days, nil
}

func validateDemoDays(days int) error {
	if days < 30 || days > 730 {
		return fmt.Errorf("days must be between 30 and 730")
	}
	return nil
}

func findOrCreate(app core.App, collection *core.Collection, field string, value any) (*core.Record, bool, error) {
	record, err := app.FindFirstRecordByData(collection, field, value)
	if err == nil {
		return record, false, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, false, err
	}
	record = core.NewRecord(collection)
	record.Set(field, value)
	return record, true, nil
}

func seedDemo(app core.App, days int) (demoSummary, error) {
	var summary demoSummary

	categoriesCollection, err := app.FindCollectionByNameOrId("categories")
	if err != nil {
		return summary, fmt.Errorf("categories collection: %w", err)
	}
	categoryRecords := make(map[string]*core.Record, len(demoCategories))
	for _, item := range demoCategories {
		record, created, err := findOrCreate(app, categoriesCollection, "name", item.Name)
		if err != nil {
			return summary, err
		}
		record.Set("name", item.Name)
		record.Set("color", item.Color)
		record.Set("lucide_icon", item.Icon)
		if err := app.Save(record); err != nil {
			return summary, err
		}
		categoryRecords[item.Name] = record
		if created {
			summary.Categories++
		}
	}
	for _, item := range demoCategories {
		record := categoryRecords[item.Name]
		parentID := ""
		if parent := categoryRecords[item.ParentName]; parent != nil {
			parentID = parent.Id
		}
		record.Set("parent_category", parentID)
		if err := app.Save(record); err != nil {
			return summary, err
		}
	}

	tagsCollection, err := app.FindCollectionByNameOrId("tags")
	if err != nil {
		return summary, fmt.Errorf("tags collection: %w", err)
	}
	tagRecords := make(map[string]*core.Record, len(demoTags))
	for _, item := range demoTags {
		record, created, err := findOrCreate(app, tagsCollection, "name", item.Name)
		if err != nil {
			return summary, err
		}
		record.Set("color", item.Color)
		record.Set("icon", item.Icon)
		if err := app.Save(record); err != nil {
			return summary, err
		}
		tagRecords[item.Name] = record
		if created {
			summary.Tags++
		}
	}

	accountsCollection, err := app.FindCollectionByNameOrId("accounts")
	if err != nil {
		return summary, fmt.Errorf("accounts collection: %w", err)
	}
	usersCollection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return summary, fmt.Errorf("users collection: %w", err)
	}
	userRecords := make(map[string]*core.Record, len(demoUsers))
	for _, item := range demoUsers {
		record, created, err := findOrCreate(app, usersCollection, "email", item.Email)
		if err != nil {
			return summary, err
		}
		record.Set("name", item.Name)
		record.Set("verified", true)
		if created {
			record.Set("password", "finbase-demo-password")
			record.Set("passwordConfirm", "finbase-demo-password")
		}
		if err := app.Save(record); err != nil {
			return summary, err
		}
		userRecords[item.Key] = record
		if created {
			summary.Users++
		}
	}
	accountRecords := make(map[string]*core.Record, len(demoAccounts))
	for _, item := range demoAccounts {
		externalID := "demo-" + item.Key
		record, created, err := findOrCreate(app, accountsCollection, "external_id", externalID)
		if err != nil {
			return summary, err
		}
		record.Set("name", item.Name)
		record.Set("type", item.Type)
		record.Set("balance", item.Balance)
		record.Set("currency", item.Currency)
		record.Set("owner", userRecords[item.Owner].Id)
		record.Set("provider_code", "demo")
		record.Set("accountable_type", "DemoAccount")
		record.Set("accountable_id", item.Key)
		record.Set("notes", "Тестовые данные Finbase")
		if err := app.Save(record); err != nil {
			return summary, err
		}
		accountRecords[item.Key] = record
		if created {
			summary.Accounts++
		}
	}

	rulesCollection, err := app.FindCollectionByNameOrId("transaction_rules")
	if err != nil {
		return summary, fmt.Errorf("transaction_rules collection: %w", err)
	}
	for _, item := range demoRules {
		category := categoryRecords[item.Category]
		if category == nil {
			return summary, fmt.Errorf("demo rule %q: category %q not found", item.Name, item.Category)
		}
		record, created, err := findOrCreate(app, rulesCollection, "name", item.Name)
		if err != nil {
			return summary, err
		}
		record.Set("resource_type", "transaction")
		record.Set("active", true)
		record.Set("conditions", []map[string]any{
			{"condition_type": "transaction_name", "operator": "like", "value": item.Name},
			{"condition_type": "transaction_type", "operator": "=", "value": item.TransactionType},
		})
		record.Set("actions", []map[string]any{{
			"action_type": "set_transaction_category",
			"value":       item.Category,
			"value_ref": map[string]any{
				"type": "Category", "id": category.Id, "name": item.Category,
			},
		}})
		if err := app.Save(record); err != nil {
			return summary, err
		}
		if created {
			summary.Rules++
		}
	}

	transactionsCollection, err := app.FindCollectionByNameOrId("transactions")
	if err != nil {
		return summary, fmt.Errorf("transactions collection: %w", err)
	}
	transfersCollection, err := app.FindCollectionByNameOrId("transfers")
	if err != nil {
		return summary, fmt.Errorf("transfers collection: %w", err)
	}
	transfersBefore, err := app.FindAllRecords(transfersCollection)
	if err != nil {
		return summary, fmt.Errorf("count transfers before demo: %w", err)
	}
	transactions := buildDemoTransactions(days)
	transactionRecords := make(map[string]*core.Record, len(transactions))
	for _, item := range transactions {
		record, created, err := findOrCreate(app, transactionsCollection, "external_id", item.ExternalID)
		if err != nil {
			return summary, err
		}
		record.Set("account", accountRecords[item.AccountKey].Id)
		if category := categoryRecords[item.Category]; category != nil {
			record.Set("category", category.Id)
		} else {
			record.Set("category", "")
		}
		tagIDs := make([]string, 0, len(item.Tags))
		for _, name := range item.Tags {
			if tag := tagRecords[name]; tag != nil {
				tagIDs = append(tagIDs, tag.Id)
			}
		}
		record.Set("tags", tagIDs)
		record.Set("date", item.Date.UTC().Format(time.RFC3339))
		record.Set("amount", item.Amount)
		record.Set("currency", "RUB")
		record.Set("note", item.Note)
		if err := app.Save(record); err != nil {
			return summary, err
		}
		transactionRecords[item.ExternalID] = record
		if created {
			summary.Transactions++
		}
	}

	for offset := 0; offset < days; offset += 30 {
		day := demoDay(offset)
		outID := "demo-transfer-out-" + day.Format("2006-01-02")
		inID := "demo-transfer-in-" + day.Format("2006-01-02")
		outflow := transactionRecords[outID]
		inflow := transactionRecords[inID]
		if outflow == nil || inflow == nil {
			continue
		}
		record, err := app.FindFirstRecordByFilter(
			transfersCollection,
			"inflow_transaction = {:inflow} && outflow_transaction = {:outflow}",
			dbx.Params{"inflow": inflow.Id, "outflow": outflow.Id},
		)
		if errors.Is(err, sql.ErrNoRows) {
			record = core.NewRecord(transfersCollection)
		} else if err != nil {
			return summary, err
		}
		record.Set("inflow_transaction", inflow.Id)
		record.Set("outflow_transaction", outflow.Id)
		record.Set("status", "accepted")
		record.Set("notes", "Демо-перевод в накопления")
		if err := app.Save(record); err != nil {
			return summary, err
		}
	}
	transfersAfter, err := app.FindAllRecords(transfersCollection)
	if err != nil {
		return summary, fmt.Errorf("count transfers after demo: %w", err)
	}
	summary.Transfers = len(transfersAfter) - len(transfersBefore)

	return summary, nil
}

func demoDay(daysAgo int) time.Time {
	now := time.Now().UTC()
	today := time.Date(now.Year(), now.Month(), now.Day(), 12, 0, 0, 0, time.UTC)
	return today.AddDate(0, 0, -daysAgo)
}

func buildDemoTransactions(days int) []demoTransaction {
	items := make([]demoTransaction, 0, days)
	add := func(kind string, offset int, account, category string, tags []string, amount float64, note string) {
		day := demoDay(offset)
		items = append(items, demoTransaction{
			ExternalID: "demo-" + kind + "-" + day.Format("2006-01-02"),
			AccountKey: account,
			Category:   category,
			Tags:       tags,
			Date:       day,
			Amount:     amount,
			Note:       note,
		})
	}

	for offset := 0; offset < days; offset++ {
		if offset%3 == 0 {
			add("groceries", offset, "checking", "Супермаркет", []string{"Обязательное"}, -float64(1300+(offset*137)%4300), "Продукты на неделю")
		}
		if offset%5 == 1 {
			add("transport", offset, "checking", "Общественный транспорт", nil, -120, "Проезд")
		}
		if offset%7 == 2 {
			add("cafe", offset, "credit", "Кафе", []string{"Отдых"}, -float64(650+(offset*83)%1600), "Кофе и обед")
		}
		if offset%11 == 4 {
			add("snacks", offset, "cash", "Вкусняшки", nil, -float64(300+(offset*29)%700), "Небольшая покупка")
		}
		if offset%17 == 6 {
			add("cinema", offset, "credit", "Кино", []string{"Отдых"}, -1200, "Билеты в кино")
		}
		if offset%29 == 9 {
			add("pharmacy", offset, "checking", "Аптека", []string{"Обязательное"}, -float64(900+(offset*41)%2400), "Аптека")
		}
		if offset%30 == 0 {
			add("salary", offset, "checking", "Оплата труда", []string{"Регулярное"}, 185000, "Зарплата")
			add("rent", offset, "checking", "Аренда", []string{"Регулярное", "Обязательное"}, -45000, "Аренда квартиры")
			add("utilities", offset, "checking", "КУ", []string{"Регулярное", "Обязательное"}, -float64(6500+(offset*17)%2500), "Коммунальные услуги")
			add("mobile", offset, "checking", "Мобильная связь", []string{"Регулярное"}, -790, "Мобильная связь")
			add("subscription", offset, "credit", "Подписки", []string{"Регулярное"}, -1290, "Цифровые подписки")
			add("transfer-out", offset, "checking", "", []string{"Перевод"}, -25000, "В накопления")
			add("transfer-in", offset, "savings", "", []string{"Перевод"}, 25000, "Пополнение накоплений")
		}
	}
	return items
}
