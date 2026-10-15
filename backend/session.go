package main

import (
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

// Unlike PocketBase's generic list filter, Finbase must not present an expired
// login as a successful, empty financial dataset. Keep all collection rules.
func registerSessionGuard(app *pocketbase.PocketBase) {
	app.OnRecordsListRequest("accounts", "transactions", "categories", "tags", "transfers", "transaction_rules", "daily_flows", "flow_splits", "category_sums", "operation_groups", "users").BindFunc(func(e *core.RecordsListRequestEvent) error {
		if e.Auth == nil {
			return e.UnauthorizedError("Finbase session is missing, expired or revoked.", nil)
		}
		return e.Next()
	})
}
