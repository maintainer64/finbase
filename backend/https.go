package main

import (
	"crypto/tls"
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/cmd"
	"github.com/pocketbase/pocketbase/core"
	"github.com/spf13/cobra"
)

// Register the standard commands explicitly so serve can support supplied TLS
// certificates while retaining PocketBase's routing, hooks and graceful shutdown.
func startFinbase(app *pocketbase.PocketBase) error {
	serve := newFinbaseServeCommand(app)
	runServe := serve.RunE
	serveResult := make(chan error, 1)
	serve.RunE = func(command *cobra.Command, args []string) error {
		err := runServe(command, args)
		serveResult <- err
		return err
	}
	app.RootCmd.AddCommand(cmd.NewSuperuserCommand(app), serve)
	if err := app.Execute(); err != nil {
		return err
	}
	// PocketBase Execute handles shutdown but doesn't propagate command errors.
	select {
	case err := <-serveResult:
		return err
	default:
		return nil
	}
}

func newFinbaseServeCommand(app *pocketbase.PocketBase) *cobra.Command {
	serve := cmd.NewServeCommand(app, true)
	defaultRun := serve.RunE
	serve.RunE = func(command *cobra.Command, args []string) error {
		addr, tlsConfig, err := httpsConfigFromEnv()
		if err != nil {
			return err
		}
		if tlsConfig == nil {
			return defaultRun(command, args)
		}
		if len(args) != 0 {
			return fmt.Errorf("FINBASE_HTTPS_ADDR cannot be combined with automatic TLS domain arguments")
		}
		if command.Flags().Changed("https") {
			return fmt.Errorf("use FINBASE_HTTPS_ADDR instead of --https when supplying a TLS certificate")
		}
		origins, err := command.Flags().GetStringSlice("origins")
		if err != nil {
			return err
		}
		app.OnServe().BindFunc(func(e *core.ServeEvent) error {
			// Do not fall back to ACME or a plaintext listener in manual TLS mode.
			e.Server.TLSConfig = tlsConfig
			return e.Next()
		})
		return apis.Serve(app, apis.ServeConfig{
			HttpsAddr:       addr,
			AllowedOrigins:  origins,
			ShowStartBanner: true,
		})
	}
	return serve
}

func httpsConfigFromEnv() (string, *tls.Config, error) {
	addr := strings.TrimSpace(os.Getenv("FINBASE_HTTPS_ADDR"))
	certFile := strings.TrimSpace(os.Getenv("FINBASE_TLS_CERT_FILE"))
	keyFile := strings.TrimSpace(os.Getenv("FINBASE_TLS_KEY_FILE"))
	if addr == "" && certFile == "" && keyFile == "" {
		return "", nil, nil
	}
	if addr == "" || certFile == "" || keyFile == "" {
		return "", nil, fmt.Errorf("HTTPS requires FINBASE_HTTPS_ADDR, FINBASE_TLS_CERT_FILE and FINBASE_TLS_KEY_FILE together")
	}
	_, port, err := net.SplitHostPort(addr)
	if err != nil {
		return "", nil, fmt.Errorf("invalid FINBASE_HTTPS_ADDR %q: %w", addr, err)
	}
	portNumber, err := strconv.Atoi(port)
	if err != nil || portNumber < 1 || portNumber > 65535 {
		return "", nil, fmt.Errorf("FINBASE_HTTPS_ADDR must contain a port between 1 and 65535")
	}
	certificate, err := tls.LoadX509KeyPair(certFile, keyFile)
	if err != nil {
		return "", nil, fmt.Errorf("load FINBASE_TLS_CERT_FILE / FINBASE_TLS_KEY_FILE: %w", err)
	}
	return addr, &tls.Config{
		MinVersion:   tls.VersionTLS12,
		Certificates: []tls.Certificate{certificate},
	}, nil
}
