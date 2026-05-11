// Command sdd is the SDD methodology CLI.
//
// Usage:
//
//	sdd verify [--config <path>]
package main

import (
	"fmt"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: sdd <subcommand> [flags]")
		fmt.Fprintln(os.Stderr, "")
		fmt.Fprintln(os.Stderr, "Subcommands:")
		fmt.Fprintln(os.Stderr, "  verify    Run structural checks and configured verifiers")
		os.Exit(2)
	}

	switch os.Args[1] {
	case "verify":
		os.Exit(runVerify(os.Args[2:]))
	default:
		fmt.Fprintf(os.Stderr, "sdd: unknown subcommand %q\n", os.Args[1])
		os.Exit(2)
	}
}
