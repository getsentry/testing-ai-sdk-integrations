# Implementation Plan

## Phase 1: Foundation (Current)

### Step 1: Documentation ✅
- [x] Create CLAUDE.md
- [x] Create README.md
- [x] Create PLAN.md

### Step 2: Specification ✅
- [x] Create `spec/test-scenarios.md` (overview)
- [x] Create individual scenario files in `spec/scenarios/`:
  - [x] G1.md - Basic completion
  - [x] G2.md - Basic completion with error
  - [x] G3.md - Multi-turn conversation
  - [x] A1.md - Agentic workflow success
  - [x] A2.md - Agentic workflow error during LLM call
  - [x] A3.md - Agentic workflow error during tool execution
  - [x] S1.md - Basic streaming
  - [x] S2.md - Streaming with error

### Step 3: Project Setup ✅
- [x] Create `.gitignore` with Node.js, Python, and env patterns
- [x] Set up directory structure (sdks/js, sdks/py, shared/)
- [x] Build TypeScript CLI orchestration tool
  - [x] Uses Commander.js for CLI commands
  - [x] `npm run cli list` - List all SDKs and test cases
  - [x] `npm run cli run --sdk <sdk> --case <case>` - Run specific tests
  - [x] Supports lifecycle hooks (beforeAll, beforeEach, afterEach, afterAll)
  - [x] Test discovery from `cases/` directories
  - [x] Setup file support (`setup.ts` or `setup.py`)
- [x] Create example SDK structure (js/openai) with G1 test case
- [x] Per-SDK `.env.example` files (not global)

### Step 4: Shared Test Utilities
- [ ] Build JavaScript mock Sentry transport
  - `shared/test-utils/js/mock-sentry.js`
  - Capture events in-memory
  - Helper functions to verify spans/events
- [ ] Build Python mock Sentry transport
  - `shared/test-utils/py/mock_sentry.py`
  - Capture events in-memory
  - Helper functions to verify spans/events

## Phase 2: First Implementations

### JavaScript: OpenAI SDK
- [ ] Set up `sdks/js/openai/`
  - [ ] package.json with dependencies
  - [ ] README.md with setup instructions
- [ ] Implement scenarios
  - [ ] `src/simple-chat.js`
  - [ ] `src/streaming.js`
  - [ ] `src/function-calling.js`
  - [ ] `src/with-errors.js`
- [ ] Write tests
  - [ ] `tests/unit/` - Fast tests with mocked transport
  - [ ] `tests/e2e/` - Real Sentry integration tests
- [ ] Verify all Sentry data is captured correctly

### Python: LangChain
- [ ] Set up `sdks/py/langchain/`
  - [ ] pyproject.toml or requirements.txt
  - [ ] README.md with setup instructions
- [ ] Implement scenarios
  - [ ] `src/simple_chat.py`
  - [ ] `src/streaming.py`
  - [ ] `src/function_calling.py`
  - [ ] `src/with_errors.py`
- [ ] Write tests
  - [ ] `tests/unit/` - Fast tests with mocked transport
  - [ ] `tests/e2e/` - Real Sentry integration tests
- [ ] Verify all Sentry data is captured correctly

### Refinement
- [ ] Review learnings from first two implementations
- [ ] Update spec if needed
- [ ] Improve shared utilities based on feedback
- [ ] Document patterns and best practices

## Phase 3: Expansion

### Additional JavaScript SDKs
- [ ] Anthropic SDK (`sdks/js/anthropic/`)
- [ ] LangChain (`sdks/js/langchain/`)
- [ ] LlamaIndex (`sdks/js/llamaindex/`)
- [ ] Additional SDKs as Sentry adds support

### Additional Python SDKs
- [ ] OpenAI SDK (`sdks/py/openai/`)
- [ ] Anthropic SDK (`sdks/py/anthropic/`)
- [ ] LlamaIndex (`sdks/py/llamaindex/`)
- [ ] Additional SDKs as Sentry adds support

## Phase 4: CI/CD & Maintenance

### Continuous Integration
- [ ] Set up GitHub Actions or similar CI
- [ ] Run fast tests on every commit
- [ ] Run E2E tests on schedule (daily/weekly)
- [ ] Alert on failures

### Monitoring
- [ ] Track AI SDK version updates
- [ ] Automatically test new versions
- [ ] Report integration breakages

### Documentation & Fixtures (Future)
- [ ] Create JSON fixtures showing expected Sentry events
- [ ] Add screenshots from Sentry UI
- [ ] Expand implementation guide with more examples

## Success Metrics

Each completed SDK implementation should:
1. ✅ Pass all automated tests (unit + E2E)
2. ✅ Capture all required Sentry data per spec
3. ✅ Have clear documentation
4. ✅ Be runnable by other developers
5. ✅ Catch real integration breakages

## Current Status

**Phase**: 1 (Foundation)
**Current Step**: Project Setup
**Next Step**: Create .env.example, .gitignore, and directory structure

## Notes

- Start with one JS and one Python SDK to establish patterns
- Some SDKs may not support all scenarios (document in implementation)
- Keep specs flexible enough to accommodate SDK differences
- Prioritize fast feedback loops for development
