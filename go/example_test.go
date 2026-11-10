package flags_test

import (
	"context"
	"fmt"
	"time"

	flags "github.com/vercel/flags/go"
)

const exampleDatafile = `{
	"projectId": "prj_example",
	"environment": "production",
	"definitions": {
		"new-checkout": {
			"variants": [false, true],
			"variantIds": ["off", "on"],
			"environments": {
				"production": {
					"rules": [{"conditions": [[["user", "plan"], "eq", "pro"]], "outcome": 1}],
					"fallthrough": 0
				}
			}
		}
	}
}`

func Example() {
	// A program in production passes only the SDK key. This example uses a
	// datafile and no network.
	datafile, err := flags.ParseDatafile([]byte(exampleDatafile))
	if err != nil {
		panic(err)
	}
	client, err := flags.NewClient("", flags.WithDatafile(datafile), flags.WithOffline())
	if err != nil {
		panic(err)
	}
	defer client.Shutdown(context.Background())

	ctx := context.Background()
	enabled, err := client.Bool(ctx, "new-checkout", false, flags.Entities{
		"user": map[string]any{"id": "u_123", "plan": "pro"},
	})
	fmt.Println(enabled, err)

	evaluation, _ := client.Evaluate(ctx, "new-checkout", nil)
	fmt.Println(evaluation.Value, evaluation.VariantID, evaluation.Reason)

	_, err = client.Bool(ctx, "unknown-flag", false, nil)
	fmt.Println(err)

	// Output:
	// true <nil>
	// false off fallthrough
	// flags: flag not found: "unknown-flag"
}

func ExampleDatafile_Evaluate() {
	datafile, err := flags.ParseDatafile([]byte(exampleDatafile))
	if err != nil {
		panic(err)
	}
	evaluation, err := datafile.Evaluate("new-checkout", flags.Entities{
		"user": map[string]any{"plan": "pro"},
	}, time.Now())
	fmt.Println(evaluation.Value, evaluation.Reason, err)

	// Output:
	// true rule_match <nil>
}
