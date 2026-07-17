package main

import (
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

// registerOIDC configures PocketBase as the confidential OIDC client. The
// browser only receives the resulting PocketBase token; the Authelia client
// secret never leaves this process.
func registerOIDC(app *pocketbase.PocketBase) {
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		issuer := strings.TrimRight(os.Getenv("FINBASE_OIDC_ISSUER"), "/")
		clientID := os.Getenv("FINBASE_OIDC_CLIENT_ID")
		clientSecret := os.Getenv("FINBASE_OIDC_CLIENT_SECRET")
		if issuer == "" && clientID == "" && clientSecret == "" {
			log.Print("Finbase OIDC is disabled; set FINBASE_OIDC_ISSUER, FINBASE_OIDC_CLIENT_ID and FINBASE_OIDC_CLIENT_SECRET")
			return e.Next()
		}
		if issuer == "" || clientID == "" || clientSecret == "" {
			return fmt.Errorf("Finbase OIDC configuration is incomplete")
		}

		users, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return fmt.Errorf("find users collection for OIDC: %w", err)
		}
		pkce := true
		users.OAuth2.Enabled = true
		users.OAuth2.MappedFields.Name = "name"
		users.OAuth2.Providers = []core.OAuth2ProviderConfig{{
			Name:         "oidc",
			DisplayName:  envOr("FINBASE_OIDC_DISPLAY_NAME", "Authelia"),
			ClientId:     clientID,
			ClientSecret: clientSecret,
			AuthURL:      issuer + "/api/oidc/authorization",
			TokenURL:     issuer + "/api/oidc/token",
			UserInfoURL:  issuer + "/api/oidc/userinfo",
			PKCE:         &pkce,
			Extra: map[string]any{
				"jwksURL": issuer + "/jwks.json",
				"issuers": []string{issuer},
			},
		}}
		if err := app.Save(users); err != nil {
			return fmt.Errorf("save OIDC configuration: %w", err)
		}
		log.Printf("Finbase OIDC enabled with %s", issuer)
		return e.Next()
	})
}

func envOr(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
