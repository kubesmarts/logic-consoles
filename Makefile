DOCS_DIR := docs/antora
DOCS_PORT ?= 8000
DOCS_DEPS := $(DOCS_DIR)/node_modules/.installed

.PHONY: docs docs-serve

docs: $(DOCS_DEPS)
	cd $(DOCS_DIR) && npm run build

$(DOCS_DEPS): $(DOCS_DIR)/package.json $(DOCS_DIR)/package-lock.json
	cd $(DOCS_DIR) && npm ci
	touch $@

docs-serve: docs
	python3 -m http.server $(DOCS_PORT) --bind 127.0.0.1 --directory $(DOCS_DIR)/target/generated-docs
