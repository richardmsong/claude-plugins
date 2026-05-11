.PHONY: build-sdd test-spec

# Build the sdd CLI binary into src/sdd/bin/ (required by go test ./spec/).
build-sdd:
	go build -o bin/sdd ./cmd/sdd

# Run the spec verifier suite (builds the binary first).
test-spec: build-sdd
	go test ./spec/
