package main

import "testing"

func TestParseDemoEnabled(t *testing.T) {
	tests := map[string]bool{
		"": false, "false": false, "0": false, "off": false,
		"true": true, "TRUE": true, "1": true, "yes": true, "on": true,
	}
	for value, expected := range tests {
		actual, err := parseDemoEnabled(value)
		if err != nil {
			t.Fatalf("parseDemoEnabled(%q): %v", value, err)
		}
		if actual != expected {
			t.Errorf("parseDemoEnabled(%q) = %v; want %v", value, actual, expected)
		}
	}
	if _, err := parseDemoEnabled("maybe"); err == nil {
		t.Fatal("parseDemoEnabled must reject an unknown value")
	}
}

func TestParseDemoDays(t *testing.T) {
	if days, err := parseDemoDays(""); err != nil || days != 180 {
		t.Fatalf("empty FINBASE_DEMO_DAYS = %d, %v; want 180", days, err)
	}
	if days, err := parseDemoDays(" 60 "); err != nil || days != 60 {
		t.Fatalf("FINBASE_DEMO_DAYS=60 = %d, %v", days, err)
	}
	for _, value := range []string{"abc", "29", "731"} {
		if _, err := parseDemoDays(value); err == nil {
			t.Errorf("parseDemoDays(%q) must fail", value)
		}
	}
}
