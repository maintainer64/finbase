package main

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"io"
	"math/big"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

func testTLSCertificate(t *testing.T) (string, string, *x509.CertPool) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	template := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "Finbase test"},
		NotBefore:             time.Now().Add(-time.Minute),
		NotAfter:              time.Now().Add(time.Hour),
		IPAddresses:           []net.IP{net.ParseIP("127.0.0.1")},
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageCertSign,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		IsCA:                  true,
		BasicConstraintsValid: true,
	}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	keyDER, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER})
	dir := t.TempDir()
	certFile, keyFile := filepath.Join(dir, "fullchain.pem"), filepath.Join(dir, "privkey.pem")
	for path, data := range map[string][]byte{certFile: certPEM, keyFile: keyPEM} {
		if err := os.WriteFile(path, data, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM(certPEM) {
		t.Fatal("could not trust test certificate")
	}
	return certFile, keyFile, roots
}

func setTestTLSEnv(t *testing.T, addr, certFile, keyFile string) {
	t.Helper()
	t.Setenv("FINBASE_HTTPS_ADDR", addr)
	t.Setenv("FINBASE_TLS_CERT_FILE", certFile)
	t.Setenv("FINBASE_TLS_KEY_FILE", keyFile)
}

func TestHTTPSConfigFromEnv(t *testing.T) {
	certFile, keyFile, _ := testTLSCertificate(t)
	_, otherKey, _ := testTLSCertificate(t)
	for _, test := range []struct {
		name, addr, cert, key, wantError string
	}{
		{name: "disabled"},
		{name: "valid", addr: "0.0.0.0:8443", cert: certFile, key: keyFile},
		{name: "IPv6", addr: "[::1]:8443", cert: certFile, key: keyFile},
		{name: "missing-files", addr: "0.0.0.0:8443", wantError: "together"},
		{name: "missing-address", cert: certFile, key: keyFile, wantError: "together"},
		{name: "missing-key", addr: ":8443", cert: certFile, wantError: "together"},
		{name: "invalid-address", addr: "https://localhost:8443", cert: certFile, key: keyFile, wantError: "FINBASE_HTTPS_ADDR"},
		{name: "missing-port", addr: "localhost", cert: certFile, key: keyFile, wantError: "FINBASE_HTTPS_ADDR"},
		{name: "bad-port", addr: ":65536", cert: certFile, key: keyFile, wantError: "port between"},
		{name: "unreadable-cert", addr: ":8443", cert: filepath.Join(t.TempDir(), "missing.pem"), key: keyFile, wantError: "load FINBASE_TLS"},
		{name: "unreadable-key", addr: ":8443", cert: certFile, key: filepath.Join(t.TempDir(), "missing.pem"), wantError: "load FINBASE_TLS"},
		{name: "mismatched-key", addr: ":8443", cert: certFile, key: otherKey, wantError: "load FINBASE_TLS"},
		{name: "invalid-PEM", addr: ":8443", cert: keyFile, key: keyFile, wantError: "load FINBASE_TLS"},
	} {
		t.Run(test.name, func(t *testing.T) {
			setTestTLSEnv(t, test.addr, test.cert, test.key)
			addr, config, err := httpsConfigFromEnv()
			if test.wantError != "" {
				if err == nil || !strings.Contains(err.Error(), test.wantError) {
					t.Fatalf("expected %q, got %v", test.wantError, err)
				}
				if config != nil {
					t.Fatal("invalid config must not enable a server")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if addr != test.addr {
				t.Fatalf("address = %q; want %q", addr, test.addr)
			}
			if test.addr == "" {
				if config != nil {
					t.Fatal("TLS must stay disabled without env")
				}
			} else if config.MinVersion != tls.VersionTLS12 || len(config.Certificates) != 1 || config.GetCertificate != nil {
				t.Fatal("expected supplied certificate, TLS >= 1.2 and no ACME fallback")
			}
		})
	}
}

func TestManualHTTPSRejectsConflictingFlags(t *testing.T) {
	certFile, keyFile, _ := testTLSCertificate(t)
	setTestTLSEnv(t, "127.0.0.1:8443", certFile, keyFile)
	for _, args := range [][]string{{"example.com"}, {"--https=127.0.0.1:9443"}} {
		command := newFinbaseServeCommand(pocketbase.New())
		command.SetArgs(args)
		if err := command.Execute(); err == nil {
			t.Fatalf("expected conflict for %v", args)
		}
	}
}

func TestFinbaseServesHTTPSWithConfiguredCertificate(t *testing.T) {
	certFile, keyFile, roots := testTLSCertificate(t)
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = listener.Close() })
	setTestTLSEnv(t, listener.Addr().String(), certFile, keyFile)
	app := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: t.TempDir()})
	if err := app.Bootstrap(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = app.ResetBootstrapState() })
	ready := make(chan *http.Server, 1)
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		e.Listener = listener
		e.InstallerFunc = nil
		if err := e.Next(); err != nil {
			return err
		}
		ready <- e.Server
		return nil
	})
	command := newFinbaseServeCommand(app)
	// Even the Docker image's existing --http flag must not open plaintext HTTP.
	if err := command.ParseFlags([]string{"--http=not-a-valid-listener", "--origins=https://frontend.example"}); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { done <- command.RunE(command, nil) }()
	var server *http.Server
	select {
	case server = <-ready:
	case err := <-done:
		t.Fatalf("HTTPS startup failed: %v", err)
	case <-time.After(10 * time.Second):
		t.Fatal("HTTPS startup timed out")
	}
	t.Cleanup(func() {
		_ = server.Close()
		select {
		case err := <-done:
			if err != nil {
				t.Errorf("HTTPS shutdown: %v", err)
			}
		case <-time.After(5 * time.Second):
			t.Error("HTTPS shutdown timed out")
		}
	})
	transport := &http.Transport{TLSClientConfig: &tls.Config{RootCAs: roots, MinVersion: tls.VersionTLS12}}
	t.Cleanup(transport.CloseIdleConnections)
	client := &http.Client{Transport: transport, Timeout: 5 * time.Second}
	request, err := http.NewRequestWithContext(context.Background(), http.MethodGet, "https://"+listener.Addr().String()+"/api/health", nil)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Origin", "https://frontend.example")
	response, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK || response.TLS == nil {
		t.Fatalf("expected HTTPS 200, got %s", response.Status)
	}
	if response.Header.Get("Access-Control-Allow-Origin") != "https://frontend.example" {
		t.Fatal("HTTPS must preserve --origins")
	}
	body, err := io.ReadAll(response.Body)
	if err != nil || !strings.Contains(string(body), "API is healthy") {
		t.Fatalf("unexpected health response: %s (%v)", body, err)
	}
	// A TLS listener may reject plaintext with either a transport error or HTTP 400.
	plain, err := client.Get("http://" + listener.Addr().String() + "/api/health")
	if err == nil {
		defer plain.Body.Close()
		if plain.StatusCode == http.StatusOK {
			t.Fatal("plaintext API must not be available")
		}
	}
}
