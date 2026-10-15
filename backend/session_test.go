package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

func TestSessionGuardDistinguishesUnauthorizedFromEmptyData(t *testing.T) {
	app := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: t.TempDir()})
	registerSessionGuard(app)
	if err := app.Bootstrap(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = app.ResetBootstrapState() })
	if err := app.RunAllMigrations(); err != nil {
		t.Fatal(err)
	}

	collection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	user := core.NewRecord(collection)
	user.SetEmail("session-test@example.com")
	user.SetPassword("session-test-password")
	if err := app.Save(user); err != nil {
		t.Fatal(err)
	}
	token, err := user.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	api, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	mux, err := api.BuildMux()
	if err != nil {
		t.Fatal(err)
	}

	for _, test := range []struct {
		name, authorization string
		status              int
	}{
		{name: "missing-token", status: http.StatusUnauthorized},
		{name: "invalid-token", authorization: "Bearer invalid.test.token", status: http.StatusUnauthorized},
		{name: "authenticated-empty-list", authorization: "Bearer " + token, status: http.StatusOK},
	} {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "/api/collections/accounts/records", nil)
			request.Header.Set("Authorization", test.authorization)
			response := httptest.NewRecorder()
			mux.ServeHTTP(response, request)
			if response.Code != test.status {
				t.Fatalf("got HTTP %d, want %d: %s", response.Code, test.status, response.Body.String())
			}
			if test.status == http.StatusOK {
				var result struct {
					Items []json.RawMessage `json:"items"`
				}
				if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
					t.Fatal(err)
				}
				if result.Items == nil || len(result.Items) != 0 {
					t.Fatalf("expected a real empty list, got %s", response.Body.String())
				}
			}
		})
	}
}
