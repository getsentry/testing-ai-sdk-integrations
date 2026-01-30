.PHONY: help install build test clean setup setup-py setup-js setup-framework

help:
	@echo "Sentry AI SDK Integration Tests"
	@echo ""
	@echo "Available commands:"
	@echo "  make install         - Install dependencies"
	@echo "  make build           - Build TypeScript code"
	@echo "  make test            - Run all tests"
	@echo "  make setup           - Setup all test environments (no execution)"
	@echo "  make setup-py        - Setup Python test environments only"
	@echo "  make setup-js        - Setup JavaScript test environments only"
	@echo "  make setup-framework FRAMEWORK=openai - Setup specific framework"
	@echo "  make clean           - Remove runs/ and build artifacts"

install:
	npm install

build:
	npm run build

test: build
	npm run test

setup: build
	npm run setup

setup-py: build
	npm run setup -- --platform py

setup-js: build
	npm run setup -- --platform js

setup-framework: build
	@if [ -z "$(FRAMEWORK)" ]; then \
		echo "Error: FRAMEWORK variable is required"; \
		echo "Usage: make setup-framework FRAMEWORK=openai"; \
		exit 1; \
	fi
	npm run setup -- --framework $(FRAMEWORK)

clean:
	rm -rf runs/
	rm -rf dist/
	rm -rf node_modules/
