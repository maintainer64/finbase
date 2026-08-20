package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

type categorySeed struct {
	Name           string
	Color          string
	ParentCategory string
	LucideIcon     string
}

var defaultCategories = []categorySeed{
	{"Дом", "#e99537", "", "house"},
}

func allowAuthenticated(collection *core.Collection, rule *string) {
	collection.ListRule = rule
	collection.ViewRule = rule
	collection.CreateRule = rule
	collection.UpdateRule = rule
	collection.DeleteRule = rule
}

func seedCategories(app core.App, collection *core.Collection) error {
	records, err := app.FindAllRecords(collection)
	if err != nil {
		return err
	}
	byName := make(map[string]*core.Record, len(records)+len(defaultCategories))
	for _, record := range records {
		byName[record.GetString("name")] = record
	}
	for _, item := range defaultCategories {
		record := byName[item.Name]
		if record == nil {
			record = core.NewRecord(collection)
			byName[item.Name] = record
		}
		record.Set("name", item.Name)
		record.Set("color", item.Color)
		record.Set("lucide_icon", item.LucideIcon)
		if err := app.Save(record); err != nil {
			return err
		}
	}

	for _, item := range defaultCategories {
		record := byName[item.Name]
		parentID := ""
		if parent := byName[item.ParentCategory]; parent != nil {
			parentID = parent.Id
		}
		record.Set("parent_category", parentID)
		if err := app.Save(record); err != nil {
			return err
		}
	}
	return nil
}

func createTransactionRules(app core.App, authRule *string) error {
	if _, err := app.FindCollectionByNameOrId("transaction_rules"); err == nil {
		return nil
	}
	rules := core.NewBaseCollection("transaction_rules")
	allowAuthenticated(rules, authRule)
	rules.Fields.Add(
		&core.TextField{Name: "name", Required: true, Max: 200},
		&core.SelectField{Name: "resource_type", Required: true, MaxSelect: 1, Values: []string{"transaction"}},
		&core.BoolField{Name: "active"},
		&core.DateField{Name: "effective_date"},
		&core.JSONField{Name: "conditions", Required: true},
		&core.JSONField{Name: "actions", Required: true},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	rules.AddIndex("idx_transaction_rules_name", true, "name", "")
	rules.AddIndex("idx_transaction_rules_active", false, "active", "")
	return app.Save(rules)
}

func createDailyFlows(app core.App, authRule *string) error {
	dailyFlows := core.NewViewCollection("daily_flows")
	dailyFlows.ListRule = authRule
	dailyFlows.ViewRule = authRule
	dailyFlows.ViewQuery = `SELECT
		(row_number() over (order by t.account, t.day) - 1) as id,
		t.account, t.day, t.delta, t.running, opening.start_balance, opening.currency
	FROM (
		SELECT x.account, date(x.date) as day, sum(x.amount) as delta,
			sum(sum(x.amount)) over (partition by x.account order by date(x.date) rows between unbounded preceding and current row) as running
		FROM transactions x JOIN accounts visible ON visible.id = x.account
		WHERE coalesce(visible.excluded_report_at, '') = ''
		GROUP BY x.account, date(x.date)
	) t
	LEFT JOIN (
		SELECT x.account, a.balance - sum(x.amount) as start_balance, a.currency
		FROM transactions x JOIN accounts a ON a.id = x.account
		WHERE coalesce(a.excluded_report_at, '') = ''
		GROUP BY x.account, a.balance, a.currency
	) opening ON opening.account = t.account`
	dailyFlows.Fields.Add(
		&core.TextField{Name: "account"}, &core.TextField{Name: "day"},
		&core.NumberField{Name: "delta"}, &core.NumberField{Name: "running"},
		&core.NumberField{Name: "start_balance"}, &core.TextField{Name: "currency"},
	)
	return app.Save(dailyFlows)
}

func createOperationGroups(app core.App, authRule *string) error {
	groups := core.NewViewCollection("operation_groups")
	groups.ListRule = authRule
	groups.ViewRule = authRule
	groups.ViewQuery = `SELECT
		(row_number() over (order by x.transactions_count desc, x.group_key) - 1) as id,
		x.group_key, x.name, x.transaction_type, x.transactions_count, x.total, x.first_date, x.last_date
	FROM (
		SELECT lower(trim(t.note)) || ':' || case when t.amount >= 0 then 'income' else 'expense' end as group_key,
			min(t.note) as name,
			case when t.amount >= 0 then 'income' else 'expense' end as transaction_type,
			count(*) as transactions_count,
			sum(t.amount) as total,
			min(t.date) as first_date,
			max(t.date) as last_date
		FROM transactions t JOIN accounts a ON a.id = t.account
		WHERE coalesce(a.excluded_report_at, '') = ''
			AND coalesce(t.category, '') = '' AND trim(coalesce(t.note, '')) != ''
		GROUP BY lower(trim(t.note)), case when t.amount >= 0 then 'income' else 'expense' end
		HAVING count(*) >= 2
	) x`
	groups.Fields.Add(
		&core.TextField{Name: "group_key"}, &core.TextField{Name: "name"},
		&core.TextField{Name: "transaction_type"}, &core.NumberField{Name: "transactions_count"},
		&core.NumberField{Name: "total"}, &core.DateField{Name: "first_date"}, &core.DateField{Name: "last_date"},
	)
	return app.Save(groups)
}

func createFlowSplits(app core.App, authRule *string) error {
	flowSplits := core.NewViewCollection("flow_splits")
	flowSplits.ListRule = authRule
	flowSplits.ViewRule = authRule
	flowSplits.ViewQuery = `SELECT
		(row_number() over (order by x.account, x.day) - 1) as id,
		x.account, x.day, x.category, x.tags, x.delta
	FROM (
		SELECT t.account, date(t.date) as day, t.category, t.tags, sum(t.amount) as delta
		FROM transactions t JOIN accounts a ON a.id = t.account
		WHERE coalesce(a.excluded_report_at, '') = ''
		GROUP BY t.account, date(t.date), t.category, t.tags
	) x`
	flowSplits.Fields.Add(
		&core.TextField{Name: "account"}, &core.TextField{Name: "day"},
		&core.TextField{Name: "category"}, &core.JSONField{Name: "tags"},
		&core.NumberField{Name: "delta"},
	)
	return app.Save(flowSplits)
}

func configureTransfers(app core.App, transfers *core.Collection) error {
	if transfers.Fields.GetByName("created") == nil {
		transfers.Fields.Add(&core.AutodateField{Name: "created", OnCreate: true})
	}
	if transfers.Fields.GetByName("updated") == nil {
		transfers.Fields.Add(&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true})
	}
	// Активная пара должна быть однозначной. Старые конфликтующие предложения
	// остаются в истории как rejected, а не удаляются.
	_, _ = app.DB().NewQuery(`UPDATE transfers SET status = 'rejected', notes = trim(notes || ' · Автоматически отклонён дубликат')
		WHERE id IN (SELECT id FROM (
			SELECT id, row_number() over (partition by inflow_transaction order by case status when 'accepted' then 0 else 1 end, rowid) as n
			FROM transfers WHERE status != 'rejected'
		) WHERE n > 1)`).Execute()
	_, _ = app.DB().NewQuery(`UPDATE transfers SET status = 'rejected', notes = trim(notes || ' · Автоматически отклонён дубликат')
		WHERE id IN (SELECT id FROM (
			SELECT id, row_number() over (partition by outflow_transaction order by case status when 'accepted' then 0 else 1 end, rowid) as n
			FROM transfers WHERE status != 'rejected'
		) WHERE n > 1)`).Execute()
	transfers.RemoveIndex("idx_transfers_inflow_active_unique")
	transfers.RemoveIndex("idx_transfers_outflow_active_unique")
	transfers.RemoveIndex("idx_transfers_inflow_outflow_unique")
	transfers.AddIndex("idx_transfers_inflow_outflow_unique", true, "inflow_transaction, outflow_transaction", "")
	transfers.AddIndex("idx_transfers_inflow_active_unique", true, "inflow_transaction", "status != 'rejected'")
	transfers.AddIndex("idx_transfers_outflow_active_unique", true, "outflow_transaction", "status != 'rejected'")
	return app.Save(transfers)
}

// upgradeExistingSchema makes the consolidated migration safe for databases
// created by the former 0001/0002/0004 migration chain.
func upgradeExistingSchema(app core.App, authRule *string) error {
	for _, name := range []string{"category_sums", "daily_flows", "flow_splits", "operation_groups"} {
		if oldView, err := app.FindCollectionByNameOrId(name); err == nil {
			if err := app.Delete(oldView); err != nil {
				return err
			}
		}
	}

	transfers, err := app.FindCollectionByNameOrId("transfers")
	if err != nil {
		return err
	}
	if err := configureTransfers(app, transfers); err != nil {
		return err
	}
	if err := createTransactionRules(app, authRule); err != nil {
		return err
	}
	if err := createDailyFlows(app, authRule); err != nil {
		return err
	}
	if err := createOperationGroups(app, authRule); err != nil {
		return err
	}
	if err := createFlowSplits(app, authRule); err != nil {
		return err
	}

	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return err
	}
	if users.Fields.GetByName("name") == nil {
		users.Fields.Add(&core.TextField{Name: "name", Max: 200})
		if err := app.Save(users); err != nil {
			return err
		}
	}
	users.ListRule = authRule
	users.ViewRule = authRule
	if err := app.Save(users); err != nil {
		return err
	}

	categories, err := app.FindCollectionByNameOrId("categories")
	if err != nil {
		return err
	}
	if categories.Fields.GetByName("lucide_icon") == nil {
		if field := categories.Fields.GetByName("icon"); field != nil {
			field.SetName("lucide_icon")
		} else {
			categories.Fields.Add(&core.TextField{Name: "lucide_icon", Max: 100})
		}
	}
	if categories.Fields.GetByName("parent_category") == nil {
		if field := categories.Fields.GetByName("parent"); field != nil {
			field.SetName("parent_category")
		} else {
			categories.Fields.Add(&core.RelationField{Name: "parent_category", MaxSelect: 1, CollectionId: categories.Id})
		}
	}
	if relation, ok := categories.Fields.GetByName("parent_category").(*core.RelationField); ok {
		relation.CascadeDelete = false
	}
	categories.RemoveIndex("idx_categories_parent")
	categories.RemoveIndex("idx_categories_parent_category")
	categories.AddIndex("idx_categories_parent_category", false, "parent_category", "")
	if err := app.Save(categories); err != nil {
		return err
	}
	if err := seedCategories(app, categories); err != nil {
		return err
	}

	transactions, err := app.FindCollectionByNameOrId("transactions")
	if err != nil {
		return err
	}
	transactions.RemoveIndex("idx_transactions_account_date")
	transactions.AddIndex("idx_transactions_account_date", false, "account, date", "")
	if err := app.Save(transactions); err != nil {
		return err
	}

	categorySums := core.NewViewCollection("category_sums")
	categorySums.ListRule = authRule
	categorySums.ViewRule = authRule
	categorySums.ViewQuery = `SELECT
		(row_number() over (order by c.name) - 1) as id,
		t.category, c.name, c.color, c.parent_category, c.lucide_icon, sum(t.amount) as total
	FROM transactions t
	JOIN categories c ON c.id = t.category
	JOIN accounts a ON a.id = t.account
	WHERE coalesce(a.excluded_report_at, '') = ''
	GROUP BY t.category, c.name, c.color, c.parent_category, c.lucide_icon`
	categorySums.Fields.Add(
		&core.TextField{Name: "category"}, &core.TextField{Name: "name"},
		&core.TextField{Name: "color"}, &core.TextField{Name: "parent_category"},
		&core.TextField{Name: "lucide_icon"}, &core.NumberField{Name: "total"},
	)
	return app.Save(categorySums)
}

func init() {
	m.Register(func(app core.App) error {
		authRule := types.Pointer(`@request.auth.id != ""`)
		if _, err := app.FindCollectionByNameOrId("accounts"); err == nil {
			return upgradeExistingSchema(app, authRule)
		}
		users, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}
		if users.Fields.GetByName("name") == nil {
			users.Fields.Add(&core.TextField{Name: "name", Max: 200})
			if err := app.Save(users); err != nil {
				return err
			}
		}
		users.ListRule = authRule
		users.ViewRule = authRule
		if err := app.Save(users); err != nil {
			return err
		}

		accounts := core.NewBaseCollection("accounts")
		allowAuthenticated(accounts, authRule)
		accounts.Fields.Add(
			&core.TextField{Name: "name", Required: true, Max: 200},
			&core.SelectField{Name: "type", Required: true, MaxSelect: 1, Values: []string{"checking", "savings", "cash", "credit"}},
			&core.NumberField{Name: "balance"},
			&core.RelationField{Name: "owner", Required: true, MaxSelect: 1, CollectionId: users.Id},
			&core.TextField{Name: "currency", Required: true, Max: 3},
			&core.TextField{Name: "external_id", Max: 200},
			&core.TextField{Name: "provider_code", Max: 50},
			&core.TextField{Name: "accountable_type", Max: 100},
			&core.TextField{Name: "accountable_id", Max: 100},
			&core.TextField{Name: "notes", Max: 1000},
			&core.DateField{Name: "disabled_at"},
			&core.DateField{Name: "excluded_report_at"},
		)
		accounts.AddIndex("idx_accounts_external_id", true, "external_id", "")
		accounts.AddIndex("idx_accounts_owner", false, "owner", "")
		accounts.AddIndex("idx_accounts_type", false, "type", "")
		accounts.AddIndex("idx_accounts_currency", false, "currency", "")
		accounts.AddIndex("idx_accounts_disabled_at", false, "disabled_at", "")
		if err := app.Save(accounts); err != nil {
			return err
		}

		categories := core.NewBaseCollection("categories")
		allowAuthenticated(categories, authRule)
		categories.Fields.Add(
			&core.TextField{Name: "name", Required: true, Max: 200},
			&core.TextField{Name: "color", Max: 7},
			&core.TextField{Name: "lucide_icon", Max: 100},
		)
		categories.AddIndex("idx_categories_name", true, "name", "")
		if err := app.Save(categories); err != nil {
			return err
		}
		categories, err = app.FindCollectionByNameOrId("categories")
		if err != nil {
			return err
		}
		categories.Fields.Add(&core.RelationField{Name: "parent_category", MaxSelect: 1, CollectionId: categories.Id})
		categories.AddIndex("idx_categories_parent_category", false, "parent_category", "")
		if err := app.Save(categories); err != nil {
			return err
		}
		if err := seedCategories(app, categories); err != nil {
			return err
		}

		tags := core.NewBaseCollection("tags")
		allowAuthenticated(tags, authRule)
		tags.Fields.Add(
			&core.TextField{Name: "name", Required: true, Max: 100},
			&core.TextField{Name: "icon", Max: 100},
			&core.TextField{Name: "color", Max: 7},
		)
		tags.AddIndex("idx_tags_name", true, "name", "")
		if err := app.Save(tags); err != nil {
			return err
		}

		transactions := core.NewBaseCollection("transactions")
		allowAuthenticated(transactions, authRule)
		transactions.Fields.Add(
			&core.RelationField{Name: "account", Required: true, MaxSelect: 1, CollectionId: accounts.Id},
			&core.RelationField{Name: "category", MaxSelect: 1, CollectionId: categories.Id},
			&core.RelationField{Name: "tags", MaxSelect: 10, CollectionId: tags.Id},
			&core.DateField{Name: "date", Required: true},
			&core.NumberField{Name: "amount", Required: true},
			&core.TextField{Name: "currency", Required: true, Max: 3},
			&core.TextField{Name: "note", Max: 1000},
			&core.TextField{Name: "external_id", Max: 200},
		)
		transactions.AddIndex("idx_transactions_account", false, "account", "")
		transactions.AddIndex("idx_transactions_category", false, "category", "")
		transactions.AddIndex("idx_transactions_date", false, "date", "")
		transactions.AddIndex("idx_transactions_currency", false, "currency", "")
		transactions.AddIndex("idx_transactions_external_id", true, "external_id", "")
		transactions.AddIndex("idx_transactions_account_date", false, "account, date", "")
		if err := app.Save(transactions); err != nil {
			return err
		}

		transfers := core.NewBaseCollection("transfers")
		allowAuthenticated(transfers, authRule)
		transfers.Fields.Add(
			&core.RelationField{Name: "inflow_transaction", Required: true, MaxSelect: 1, CollectionId: transactions.Id, CascadeDelete: true},
			&core.RelationField{Name: "outflow_transaction", Required: true, MaxSelect: 1, CollectionId: transactions.Id, CascadeDelete: true},
			&core.SelectField{Name: "status", Required: true, MaxSelect: 1, Values: []string{"pending", "accepted", "rejected"}},
			&core.TextField{Name: "notes", Max: 1000},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		transfers.AddIndex("idx_transfers_inflow", false, "inflow_transaction", "")
		transfers.AddIndex("idx_transfers_outflow", false, "outflow_transaction", "")
		transfers.AddIndex("idx_transfers_status", false, "status", "")
		if err := app.Save(transfers); err != nil {
			return err
		}
		if err := configureTransfers(app, transfers); err != nil {
			return err
		}
		if err := createTransactionRules(app, authRule); err != nil {
			return err
		}
		if err := createDailyFlows(app, authRule); err != nil {
			return err
		}

		categorySums := core.NewViewCollection("category_sums")
		categorySums.ListRule = authRule
		categorySums.ViewRule = authRule
		categorySums.ViewQuery = `SELECT
			(row_number() over (order by c.name) - 1) as id,
			t.category, c.name, c.color, c.parent_category, c.lucide_icon, sum(t.amount) as total
		FROM transactions t
		JOIN categories c ON c.id = t.category
		JOIN accounts a ON a.id = t.account
		WHERE coalesce(a.excluded_report_at, '') = ''
		GROUP BY t.category, c.name, c.color, c.parent_category, c.lucide_icon`
		categorySums.Fields.Add(
			&core.TextField{Name: "category"}, &core.TextField{Name: "name"},
			&core.TextField{Name: "color"}, &core.TextField{Name: "parent_category"},
			&core.TextField{Name: "lucide_icon"}, &core.NumberField{Name: "total"},
		)
		if err := app.Save(categorySums); err != nil {
			return err
		}

		if err := createFlowSplits(app, authRule); err != nil {
			return err
		}
		return createOperationGroups(app, authRule)
	}, func(app core.App) error {
		// When this migration upgraded a database created by the old chain, a
		// rollback must not remove the user's base collections.
		var legacyMigrations int
		if err := app.DB().NewQuery("SELECT count(*) FROM _migrations WHERE file IN ('0001_initial.go', '20260820_finbase_v2.go')").Row(&legacyMigrations); err == nil && legacyMigrations > 0 {
			return nil
		}
		for _, name := range []string{"operation_groups", "flow_splits", "category_sums", "daily_flows", "transaction_rules", "transfers", "transactions", "tags", "categories", "accounts"} {
			collection, err := app.FindCollectionByNameOrId(name)
			if err == nil {
				if err := app.Delete(collection); err != nil {
					return err
				}
			}
		}
		return nil
	}, "20260820_finbase_v3.go")
}
