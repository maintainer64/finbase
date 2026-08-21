package main

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

const defaultReportingTimezoneOffset = "+00:00"

// reportingTimezoneOffset возвращает безопасный SQLite-модификатор ±HH:MM.
func reportingTimezoneOffset() string {
	value := strings.TrimSpace(os.Getenv("FINBASE_TIMEZONE_OFFSET"))
	if value == "" {
		return defaultReportingTimezoneOffset
	}
	if len(value) != 6 || (value[0] != '+' && value[0] != '-') || value[3] != ':' {
		return defaultReportingTimezoneOffset
	}
	hours, hoursErr := strconv.Atoi(value[1:3])
	minutes, minutesErr := strconv.Atoi(value[4:6])
	if hoursErr != nil || minutesErr != nil || hours > 14 || minutes > 59 || (hours == 14 && minutes != 0) {
		return defaultReportingTimezoneOffset
	}
	return value
}

// configureReportingTimezone обновляет отчётные view и на уже существующей
// базе: применяет часовой пояс и исключает подтверждённые внутренние переводы.
func configureReportingTimezone(app core.App) error {
	offset := reportingTimezoneOffset()
	day := func(column string) string { return fmt.Sprintf("date(%s, '%s')", column, offset) }

	dailyFlows, err := app.FindCollectionByNameOrId("daily_flows")
	if err != nil {
		return err
	}
	dailyQuery := fmt.Sprintf(`SELECT
		(row_number() over (order by t.account, t.day) - 1) as id,
		t.account, t.day, t.delta, t.running, opening.start_balance, opening.currency
	FROM (
		SELECT x.account, %[1]s as day, sum(x.amount) as delta,
			sum(sum(x.amount)) over (partition by x.account order by %[1]s rows between unbounded preceding and current row) as running
		FROM transactions x JOIN accounts visible ON visible.id = x.account
		WHERE coalesce(visible.excluded_report_at, '') = ''
		GROUP BY x.account, %[1]s
	) t
	LEFT JOIN (
		SELECT x.account, a.balance - sum(x.amount) as start_balance, a.currency
		FROM transactions x JOIN accounts a ON a.id = x.account
		WHERE coalesce(a.excluded_report_at, '') = ''
		GROUP BY x.account, a.balance, a.currency
	) opening ON opening.account = t.account`, day("x.date"))
	if dailyFlows.ViewQuery != dailyQuery {
		dailyFlows.ViewQuery = dailyQuery
		if err := app.Save(dailyFlows); err != nil {
			return fmt.Errorf("save daily_flows timezone: %w", err)
		}
	}

	flowSplits, err := app.FindCollectionByNameOrId("flow_splits")
	if err != nil {
		return err
	}
	flowSplitsQuery := fmt.Sprintf(`SELECT
		(row_number() over (order by x.account, x.day) - 1) as id,
		x.account, x.day, x.category, x.tags, x.delta
	FROM (
		SELECT t.account, %[1]s as day, t.category, t.tags, sum(t.amount) as delta
		FROM transactions t JOIN accounts a ON a.id = t.account
		WHERE coalesce(a.excluded_report_at, '') = ''
			AND NOT EXISTS (SELECT 1 FROM transfers tr WHERE tr.status = 'accepted'
				AND (tr.inflow_transaction = t.id OR tr.outflow_transaction = t.id))
		GROUP BY t.account, %[1]s, t.category, t.tags
	) x`, day("t.date"))
	if flowSplits.ViewQuery != flowSplitsQuery {
		flowSplits.ViewQuery = flowSplitsQuery
		if err := app.Save(flowSplits); err != nil {
			return fmt.Errorf("save flow_splits timezone: %w", err)
		}
	}

	categorySums, err := app.FindCollectionByNameOrId("category_sums")
	if err != nil {
		return err
	}
	categorySumsQuery := `SELECT
		(row_number() over (order by c.name) - 1) as id,
		t.category, c.name, c.color, c.parent_category, c.lucide_icon, sum(t.amount) as total
	FROM transactions t
	JOIN categories c ON c.id = t.category
	JOIN accounts a ON a.id = t.account
	WHERE coalesce(a.excluded_report_at, '') = ''
		AND NOT EXISTS (SELECT 1 FROM transfers tr WHERE tr.status = 'accepted'
			AND (tr.inflow_transaction = t.id OR tr.outflow_transaction = t.id))
	GROUP BY t.category, c.name, c.color, c.parent_category, c.lucide_icon`
	if categorySums.ViewQuery != categorySumsQuery {
		categorySums.ViewQuery = categorySumsQuery
		if err := app.Save(categorySums); err != nil {
			return fmt.Errorf("save category_sums transfers filter: %w", err)
		}
	}

	operationGroups, err := app.FindCollectionByNameOrId("operation_groups")
	if err != nil {
		return err
	}
	operationGroupsQuery := `SELECT
		(row_number() over (order by x.transactions_count desc, x.group_key) - 1) as id,
		x.group_key, x.name, x.transaction_type, x.transactions_count, x.total, x.first_date, x.last_date
	FROM (
		SELECT lower(t.note) || ':' || case when t.amount >= 0 then 'income' else 'expense' end as group_key,
			min(t.note) as name,
			case when t.amount >= 0 then 'income' else 'expense' end as transaction_type,
			count(*) as transactions_count,
			sum(t.amount) as total,
			min(t.date) as first_date,
			max(t.date) as last_date
		FROM transactions t JOIN accounts a ON a.id = t.account
		WHERE coalesce(a.excluded_report_at, '') = ''
			AND coalesce(t.category, '') = '' AND trim(coalesce(t.note, '')) != ''
			AND NOT EXISTS (SELECT 1 FROM transfers tr WHERE tr.status = 'accepted'
				AND (tr.inflow_transaction = t.id OR tr.outflow_transaction = t.id))
		GROUP BY lower(t.note), case when t.amount >= 0 then 'income' else 'expense' end
		HAVING count(*) >= 2
	) x`
	if operationGroups.ViewQuery != operationGroupsQuery {
		operationGroups.ViewQuery = operationGroupsQuery
		if err := app.Save(operationGroups); err != nil {
			return fmt.Errorf("save operation_groups transfers filter: %w", err)
		}
	}

	return nil
}
