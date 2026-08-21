package main

import (
	"testing"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

func TestCompareText(t *testing.T) {
	tests := []struct {
		actual, operator, expected string
		want                       bool
	}{
		{"Оплата РЖД Москва", "like", "ржд", true},
		{"  Яндекс Лавка  ", "=", "яндекс лавка", true},
		{"МТС Mobile +7", "starts_with", "мтс", true},
		{"Проценты на остаток", "ends_with", "остаток", true},
		{"Кафе", "not_like", "такси", true},
		{"Кафе", "like", "такси", false},
		{"Кафе", "unknown", "кафе", false},
	}
	for _, test := range tests {
		if got := compareText(test.actual, test.operator, test.expected); got != test.want {
			t.Errorf("compareText(%q, %q, %q) = %v; want %v", test.actual, test.operator, test.expected, got, test.want)
		}
	}
}

func TestCompareNumber(t *testing.T) {
	if !compareNumber(1500, ">=", "1500") {
		t.Fatal("1500 must be >= 1500")
	}
	if compareNumber(1499, ">=", 1500) {
		t.Fatal("1499 must not be >= 1500")
	}
	if compareNumber(10, "=", "not-a-number") {
		t.Fatal("invalid expected number must not match")
	}
}

func TestTransferWindow(t *testing.T) {
	t.Setenv("FINBASE_TRANSFER_WINDOW_MINUTES", "45")
	if got := transferWindow(); got != 45*time.Minute {
		t.Fatalf("transferWindow() = %s; want 45m", got)
	}

	t.Setenv("FINBASE_TRANSFER_WINDOW_MINUTES", "invalid")
	if got := transferWindow(); got != 30*time.Minute {
		t.Fatalf("invalid transferWindow() = %s; want default 30m", got)
	}

	t.Setenv("FINBASE_TRANSFER_WINDOW_MINUTES", "1441")
	if got := transferWindow(); got != 30*time.Minute {
		t.Fatalf("out-of-range transferWindow() = %s; want default 30m", got)
	}
}

func TestReportingTimezoneOffset(t *testing.T) {
	t.Setenv("FINBASE_TIMEZONE_OFFSET", "+05:00")
	if got := reportingTimezoneOffset(); got != "+05:00" {
		t.Fatalf("reportingTimezoneOffset() = %q; want +05:00", got)
	}

	for _, invalid := range []string{"UTC", "+15:00", "+05:99", "+5:00", "+14:30"} {
		t.Setenv("FINBASE_TIMEZONE_OFFSET", invalid)
		if got := reportingTimezoneOffset(); got != defaultReportingTimezoneOffset {
			t.Errorf("reportingTimezoneOffset(%q) = %q; want default", invalid, got)
		}
	}
}

func TestAcceptedTransferAssignsSystemCategory(t *testing.T) {
	app := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: t.TempDir()})
	registerAutomation(app)
	if err := app.Bootstrap(); err != nil {
		t.Fatal(err)
	}
	defer app.ResetBootstrapState()
	if err := app.RunAllMigrations(); err != nil {
		t.Fatal(err)
	}

	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	user := core.NewRecord(users)
	user.SetEmail("transfer-test@example.com")
	user.SetPassword("transfer-test-password")
	if err := app.Save(user); err != nil {
		t.Fatal(err)
	}

	accounts, err := app.FindCollectionByNameOrId("accounts")
	if err != nil {
		t.Fatal(err)
	}
	createAccount := func(name, externalID string) *core.Record {
		record := core.NewRecord(accounts)
		record.Set("name", name)
		record.Set("type", "checking")
		record.Set("owner", user.Id)
		record.Set("currency", "RUB")
		record.Set("external_id", externalID)
		if err := app.Save(record); err != nil {
			t.Fatal(err)
		}
		return record
	}
	from := createAccount("Источник", "transfer-test-from")
	to := createAccount("Получатель", "transfer-test-to")

	transactions, err := app.FindCollectionByNameOrId("transactions")
	if err != nil {
		t.Fatal(err)
	}
	createTransaction := func(account *core.Record, amount float64, date, externalID string) *core.Record {
		record := core.NewRecord(transactions)
		record.Set("account", account.Id)
		record.Set("date", date)
		record.Set("amount", amount)
		record.Set("currency", "RUB")
		record.Set("note", "Внутренний перевод")
		record.Set("external_id", externalID)
		if err := app.Save(record); err != nil {
			t.Fatal(err)
		}
		return record
	}
	outflow := createTransaction(from, -1500, "2026-08-20 10:00:00.000Z", "transfer-test-out")
	inflow := createTransaction(to, 1500, "2026-08-20 12:00:00.000Z", "transfer-test-in")
	regularCategory, err := app.FindFirstRecordByData("categories", "name", "Дом")
	if err != nil {
		t.Fatal(err)
	}
	for _, transaction := range []*core.Record{inflow, outflow} {
		transaction.Set("category", regularCategory.Id)
		if err := app.Save(transaction); err != nil {
			t.Fatal(err)
		}
	}

	transfers, err := app.FindCollectionByNameOrId("transfers")
	if err != nil {
		t.Fatal(err)
	}
	transfer := core.NewRecord(transfers)
	transfer.Set("inflow_transaction", inflow.Id)
	transfer.Set("outflow_transaction", outflow.Id)
	transfer.Set("status", "accepted")
	if err := app.Save(transfer); err != nil {
		t.Fatal(err)
	}

	category, err := app.FindFirstRecordByData("categories", "name", transferCategoryName)
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{inflow.Id, outflow.Id} {
		transaction, err := app.FindRecordById("transactions", id)
		if err != nil {
			t.Fatal(err)
		}
		if got := transaction.GetString("category"); got != category.Id {
			t.Fatalf("transaction %s category = %q; want %q", id, got, category.Id)
		}
	}

	var reportRows int
	if err := app.DB().NewQuery("SELECT count(*) FROM flow_splits").Row(&reportRows); err != nil {
		t.Fatal(err)
	}
	if reportRows != 0 {
		t.Fatalf("confirmed transfer produced %d flow_splits rows; want 0", reportRows)
	}
}
