package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

type transactionRuleCondition struct {
	ConditionType string `json:"condition_type"`
	Operator      string `json:"operator"`
	Value         any    `json:"value"`
}

type transactionRuleValueRef struct {
	Type string `json:"type"`
	ID   string `json:"id"`
	Name string `json:"name"`
}

type transactionRuleAction struct {
	ActionType string                  `json:"action_type"`
	Value      any                     `json:"value"`
	ValueRef   transactionRuleValueRef `json:"value_ref"`
}

func registerAutomation(app *pocketbase.PocketBase) {
	// Владелец счёта определяется аутентифицированной PocketBase-сессией.
	// Клиенту не нужно разбирать JWT или передавать пустой relation вручную.
	app.OnRecordCreateRequest("accounts").BindFunc(func(e *core.RecordRequestEvent) error {
		if e.Record.GetString("owner") == "" && e.Auth != nil && e.Auth.Collection().Name == "users" {
			e.Record.Set("owner", e.Auth.Id)
		}
		return e.Next()
	})

	// balance — вычисляемое поле. Клиент может прислать его для совместимости,
	// но backend всегда заменяет значение фактической суммой операций.
	app.OnRecordCreate("accounts").BindFunc(func(e *core.RecordEvent) error {
		e.Record.Set("balance", 0)
		return e.Next()
	})
	app.OnRecordUpdate("accounts").BindFunc(func(e *core.RecordEvent) error {
		total, err := calculatedAccountBalance(e.App, e.Record.Id)
		if err != nil {
			return fmt.Errorf("calculate account balance: %w", err)
		}
		e.Record.Set("balance", total)
		return e.Next()
	})

	app.OnRecordCreate("transactions").BindFunc(func(e *core.RecordEvent) error {
		if _, err := applyFirstMatchingRule(e.App, e.Record); err != nil {
			return fmt.Errorf("apply transaction rule: %w", err)
		}
		return e.Next()
	})
	app.OnRecordUpdate("transactions").BindFunc(func(e *core.RecordEvent) error {
		if _, err := applyFirstMatchingRule(e.App, e.Record); err != nil {
			return fmt.Errorf("apply transaction rule: %w", err)
		}
		return e.Next()
	})

	afterTransactionChange := func(e *core.RecordEvent) error {
		accountID := e.Record.GetString("account")
		if accountID != "" {
			if err := recalculateAccountBalance(e.App, accountID); err != nil {
				log.Printf("Finbase balance recalculation failed for %s: %v", accountID, err)
			}
		}
		if e.Type != core.ModelEventTypeDelete {
			if err := detectTransfer(e.App, e.Record, transferWindow()); err != nil {
				log.Printf("Finbase transfer detection failed for %s: %v", e.Record.Id, err)
			}
		}
		return e.Next()
	}
	app.OnRecordAfterCreateSuccess("transactions").BindFunc(afterTransactionChange)
	app.OnRecordAfterUpdateSuccess("transactions").BindFunc(func(e *core.RecordEvent) error {
		oldAccountID := e.Record.Original().GetString("account")
		if oldAccountID != "" && oldAccountID != e.Record.GetString("account") {
			if err := recalculateAccountBalance(e.App, oldAccountID); err != nil {
				log.Printf("Finbase balance recalculation failed for previous account %s: %v", oldAccountID, err)
			}
		}
		return afterTransactionChange(e)
	})
	app.OnRecordAfterDeleteSuccess("transactions").BindFunc(afterTransactionChange)

	applyRuleToHistory := func(e *core.RecordEvent) error {
		if e.Record.GetBool("active") {
			if err := applyRuleToExistingTransactions(e.App, e.Record); err != nil {
				log.Printf("Finbase historical rule application failed for %s: %v", e.Record.Id, err)
			}
		}
		return e.Next()
	}
	app.OnRecordAfterCreateSuccess("transaction_rules").BindFunc(applyRuleToHistory)
	app.OnRecordAfterUpdateSuccess("transaction_rules").BindFunc(applyRuleToHistory)

	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		if err := configureReportingTimezone(e.App); err != nil {
			return fmt.Errorf("configure Finbase reporting timezone: %w", err)
		}
		if err := recalculateAllAccountBalances(e.App); err != nil {
			return fmt.Errorf("recalculate Finbase balances: %w", err)
		}
		return e.Next()
	})
}

func transferWindow() time.Duration {
	value := strings.TrimSpace(os.Getenv("FINBASE_TRANSFER_WINDOW_MINUTES"))
	if value == "" {
		return 30 * time.Minute
	}
	minutes, err := strconv.Atoi(value)
	if err != nil || minutes < 1 || minutes > 1440 {
		log.Printf("Invalid FINBASE_TRANSFER_WINDOW_MINUTES=%q; using 30", value)
		return 30 * time.Minute
	}
	return time.Duration(minutes) * time.Minute
}

func recalculateAccountBalance(app core.App, accountID string) error {
	account, err := app.FindRecordById("accounts", accountID)
	if err != nil {
		return err
	}
	total, err := calculatedAccountBalance(app, accountID)
	if err != nil {
		return err
	}
	if account.GetFloat("balance") == total {
		return nil
	}
	account.Set("balance", total)
	return app.Save(account)
}

func calculatedAccountBalance(app core.App, accountID string) (float64, error) {
	var total float64
	err := app.DB().NewQuery(
		"SELECT coalesce(sum(amount), 0) FROM transactions WHERE account = {:account}",
	).Bind(dbx.Params{"account": accountID}).Row(&total)
	return total, err
}

func recalculateAllAccountBalances(app core.App) error {
	accounts, err := app.FindAllRecords("accounts")
	if err != nil {
		return err
	}
	for _, account := range accounts {
		if err := recalculateAccountBalance(app, account.Id); err != nil {
			return err
		}
	}
	return nil
}

func recordJSON(record *core.Record, field string, target any) error {
	data, err := json.Marshal(record.GetRaw(field))
	if err != nil {
		return err
	}
	return json.Unmarshal(data, target)
}

func normalizedString(value any) string {
	return strings.ToLower(strings.TrimSpace(fmt.Sprint(value)))
}

func compareText(actual, operator, expected string) bool {
	actual = normalizedString(actual)
	expected = normalizedString(expected)
	switch strings.ToLower(strings.TrimSpace(operator)) {
	case "like", "contains", "~":
		return strings.Contains(actual, expected)
	case "not_like", "not contains", "!~":
		return !strings.Contains(actual, expected)
	case "=", "==", "equals":
		return actual == expected
	case "!=", "not_equals":
		return actual != expected
	case "starts_with":
		return strings.HasPrefix(actual, expected)
	case "ends_with":
		return strings.HasSuffix(actual, expected)
	default:
		return false
	}
}

func compareNumber(actual float64, operator string, expected any) bool {
	wanted, err := strconv.ParseFloat(fmt.Sprint(expected), 64)
	if err != nil {
		return false
	}
	switch strings.TrimSpace(operator) {
	case "=", "==":
		return actual == wanted
	case "!=":
		return actual != wanted
	case ">":
		return actual > wanted
	case ">=":
		return actual >= wanted
	case "<":
		return actual < wanted
	case "<=":
		return actual <= wanted
	default:
		return false
	}
}

func ruleMatches(app core.App, rule, transaction *core.Record) (bool, error) {
	if !rule.GetBool("active") || rule.GetString("resource_type") != "transaction" {
		return false, nil
	}
	effectiveDate := rule.GetDateTime("effective_date")
	if !effectiveDate.IsZero() && transaction.GetDateTime("date").Before(effectiveDate) {
		return false, nil
	}
	var conditions []transactionRuleCondition
	if err := recordJSON(rule, "conditions", &conditions); err != nil {
		return false, err
	}
	if len(conditions) == 0 {
		return false, nil
	}
	for _, condition := range conditions {
		conditionType := strings.ToLower(strings.TrimSpace(condition.ConditionType))
		expected := fmt.Sprint(condition.Value)
		matched := false
		switch conditionType {
		case "transaction_name", "name", "note":
			matched = compareText(transaction.GetString("note"), condition.Operator, expected)
		case "transaction_type", "type":
			actual := "expense"
			if transaction.GetFloat("amount") >= 0 {
				actual = "income"
			}
			matched = compareText(actual, condition.Operator, expected)
		case "amount", "transaction_amount":
			matched = compareNumber(math.Abs(transaction.GetFloat("amount")), condition.Operator, condition.Value)
		case "account":
			actual := transaction.GetString("account")
			if account, err := app.FindRecordById("accounts", actual); err == nil {
				matched = compareText(actual, condition.Operator, expected) || compareText(account.GetString("name"), condition.Operator, expected)
			} else {
				matched = compareText(actual, condition.Operator, expected)
			}
		default:
			matched = false
		}
		if !matched {
			return false, nil
		}
	}
	return true, nil
}

func resolveCategory(app core.App, action transactionRuleAction) (*core.Record, error) {
	if action.ValueRef.ID != "" {
		category, err := app.FindRecordById("categories", action.ValueRef.ID)
		if err == nil {
			return category, nil
		}
	}
	name := strings.TrimSpace(fmt.Sprint(action.Value))
	if action.ValueRef.Name != "" {
		name = action.ValueRef.Name
	}
	if name == "" {
		return nil, errors.New("category action has no value")
	}
	return app.FindFirstRecordByData("categories", "name", name)
}

func applyRuleActions(app core.App, rule, transaction *core.Record) (bool, error) {
	var actions []transactionRuleAction
	if err := recordJSON(rule, "actions", &actions); err != nil {
		return false, err
	}
	changed := false
	for _, action := range actions {
		switch strings.ToLower(strings.TrimSpace(action.ActionType)) {
		case "set_transaction_category", "set_category":
			category, err := resolveCategory(app, action)
			if err != nil {
				return false, err
			}
			transaction.Set("category", category.Id)
			changed = true
		}
	}
	return changed, nil
}

func applyFirstMatchingRule(app core.App, transaction *core.Record) (bool, error) {
	if transaction.GetString("category") != "" {
		return false, nil
	}
	rules, err := app.FindRecordsByFilter("transaction_rules", "active = true && resource_type = 'transaction'", "name", 0, 0)
	if err != nil {
		return false, err
	}
	for _, rule := range rules {
		matches, err := ruleMatches(app, rule, transaction)
		if err != nil {
			return false, err
		}
		if !matches {
			continue
		}
		changed, err := applyRuleActions(app, rule, transaction)
		if err != nil {
			return false, err
		}
		if changed {
			return true, nil
		}
	}
	return false, nil
}

func applyRuleToExistingTransactions(app core.App, rule *core.Record) error {
	transactions, err := app.FindRecordsByFilter("transactions", "category = ''", "date", 0, 0)
	if err != nil {
		return err
	}
	for _, transaction := range transactions {
		matches, err := ruleMatches(app, rule, transaction)
		if err != nil {
			return err
		}
		if !matches {
			continue
		}
		changed, err := applyRuleActions(app, rule, transaction)
		if err != nil {
			return err
		}
		if changed {
			if err := app.Save(transaction); err != nil {
				return err
			}
		}
	}
	return nil
}

func transactionHasActiveTransfer(app core.App, transactionID string) bool {
	_, err := app.FindFirstRecordByFilter(
		"transfers",
		"status != 'rejected' && (inflow_transaction = {:id} || outflow_transaction = {:id})",
		dbx.Params{"id": transactionID},
	)
	return err == nil
}

func transferPairExists(app core.App, inflowID, outflowID string) bool {
	_, err := app.FindFirstRecordByFilter(
		"transfers",
		"inflow_transaction = {:inflow} && outflow_transaction = {:outflow}",
		dbx.Params{"inflow": inflowID, "outflow": outflowID},
	)
	return err == nil
}

func detectTransfer(app core.App, transaction *core.Record, window time.Duration) error {
	amount := transaction.GetFloat("amount")
	date := transaction.GetDateTime("date")
	if amount == 0 || date.IsZero() || transactionHasActiveTransfer(app, transaction.Id) {
		return nil
	}
	candidates, err := app.FindRecordsByFilter(
		"transactions",
		"id != {:id} && account != {:account} && currency = {:currency} && amount = {:opposite} && date >= {:from} && date <= {:to}",
		"date",
		0,
		0,
		dbx.Params{
			"id": transaction.Id, "account": transaction.GetString("account"),
			"currency": transaction.GetString("currency"), "opposite": -amount,
			"from": date.Time().Add(-window), "to": date.Time().Add(window),
		},
	)
	if err != nil {
		return err
	}
	available := make([]*core.Record, 0, len(candidates))
	for _, candidate := range candidates {
		inflow, outflow := transaction, candidate
		if amount < 0 {
			inflow, outflow = candidate, transaction
		}
		if transactionHasActiveTransfer(app, candidate.Id) || transferPairExists(app, inflow.Id, outflow.Id) {
			continue
		}
		available = append(available, candidate)
	}
	if len(available) != 1 {
		return nil
	}
	candidate := available[0]
	inflow, outflow := transaction, candidate
	if amount < 0 {
		inflow, outflow = candidate, transaction
	}
	transfers, err := app.FindCollectionByNameOrId("transfers")
	if err != nil {
		return err
	}
	record := core.NewRecord(transfers)
	record.Set("inflow_transaction", inflow.Id)
	record.Set("outflow_transaction", outflow.Id)
	record.Set("status", "pending")
	difference := inflow.GetDateTime("date").Time().Sub(outflow.GetDateTime("date").Time()).Abs().Round(time.Minute)
	record.Set("notes", fmt.Sprintf("Автоопределение: одинаковая сумма, разница %s", difference))
	return app.Save(record)
}
