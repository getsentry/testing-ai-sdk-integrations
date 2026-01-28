.PHONY: help install build test clean render render-py render-js render-framework clean-preview

help:
	@echo "Sentry AI SDK Integration Tests"
	@echo ""
	@echo "Available commands:"
	@echo "  make install         - Install dependencies"
	@echo "  make build           - Build TypeScript code"
	@echo "  make test            - Run all tests"
	@echo "  make render          - Preview all templates in .preview/"
	@echo "  make render-py       - Preview Python templates only"
	@echo "  make render-js       - Preview JavaScript templates only"
	@echo "  make render-framework FRAMEWORK=openai - Preview specific framework"
	@echo "  make clean           - Remove runs/, .preview/, and build artifacts"
	@echo "  make clean-preview   - Remove .preview/ directory"

install:
	npm install

build:
	npm run build

test: build
	npm run test

render: build
	npm run render-templates

render-py: build
	npm run render-templates -- --platform py

render-js: build
	npm run render-templates -- --platform js

render-framework: build
	@if [ -z "$(FRAMEWORK)" ]; then \
		echo "Error: FRAMEWORK variable is required"; \
		echo "Usage: make render-framework FRAMEWORK=openai"; \
		exit 1; \
	fi
	npm run render-templates -- --framework $(FRAMEWORK)

clean:
	rm -rf runs/
	rm -rf .preview/
	rm -rf dist/
	rm -rf node_modules/

clean-preview:
	rm -rf .preview/
