package main

import (
	"testing"
	"time"
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
