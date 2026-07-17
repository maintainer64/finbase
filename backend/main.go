package main

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
	"github.com/pocketbase/pocketbase/tools/osutils"

	_ "github.com/maintainer64/finbase/backend/migrations"
)

func main() {
	app := pocketbase.New()
	registerOIDC(app)
	registerAutomation(app)
	registerDemoCommand(app)
	registerDemoEnv(app)

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: osutils.IsProbablyGoRun(),
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
