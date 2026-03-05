# LangGraph Browser Test Coverage — Findings

Tested with `@sentry/browser@latest`, `@langchain/langgraph@1.2.0`, `@langchain/openai@1.2.12`, `@langchain/core@1.1.30`.

---

## What Was Built

Five browser framework variants were added under `src/runner/templates/agents/browser/`, one per known Sentry SDK bug. Each is fully isolated — a bug in one variant cannot influence another.

| Framework | Sentry API | Bug surfaced | Skipped tests |
|-----------|-----------|--------------|---------------|
| `langgraph` | `instrumentLangGraph()` only, blocking + streaming | Bug 3 | Tool Call, Tool Error |
| `langgraph-langchain` | `createLangChainCallbackHandler()` only | Bug 2 | Tool Call, Tool Error |
| `langgraph-combined` | Both APIs together | Bug 4 | Tool Call, Tool Error |
| `langgraph-compiled` | `instrumentLangGraph()` on a compiled graph | Bug 1 | Tool Call, Tool Error |
| `langgraph-custom-state` | `instrumentLangGraph()` + custom `Annotation.Root` | Bug 5 | Tool Call, Tool Error |

All use `StateGraph` + `.compile()` except `langgraph-compiled` (which uses `createReactAgent` to reproduce the exact crash).
All use `@langchain/openai` (OpenAI) as the underlying LLM provider.

---

## Dependency Issues Found and Fixed

### 1. `@langchain/core` version incompatibility
Original pinned versions (`@langchain/openai@0.3.0`, `@langchain/core@0.3.49`) were incompatible with `@langchain/langgraph@1.2.0`, which requires `@langchain/core@^1.1.16`. Updated to:

```json
{ "package": "@langchain/openai", "version": "1.2.12" },
{ "package": "@langchain/core", "version": "1.1.30" }
```

### 2. `node:async_hooks` not available in browser
`@langchain/langgraph@1.2.0` imports `AsyncLocalStorage` from `node:async_hooks` in its main entry point (`@langchain/langgraph`). Vite cannot bundle this for the browser.

**Fix:** All templates now import from `@langchain/langgraph/web`, which is the browser-safe entry point that exports the same `StateGraph`, `MessagesAnnotation`, `Annotation`, `START`, `END` without the Node.js dependency.

### 3. `openAIApiKey` renamed to `apiKey` in `@langchain/openai@1.2.12`
`ChatOpenAI` constructor parameter changed from `openAIApiKey` to `apiKey`. Passing the old name is silently ignored, causing "Missing credentials" errors at runtime even when `window.OPENAI_API_KEY` is correctly injected by Playwright.

**Fix:** All templates updated to pass `apiKey: OPENAI_API_KEY`.

---

## New Check Added: `checkAgentInputOutputMessages`

Added to `src/test-cases/checks.ts` and wired into Basic Agent Test.

- Validates `gen_ai.input.messages` and `gen_ai.output.messages` on `invoke_agent` spans
- Skips for all frameworks that do not use `instrumentLangGraph` (guards on `config.name`)
- Only runs for: `langgraph`, `langgraph-combined`, `langgraph-custom-state`
- **Passes** for `langgraph` blocking (baseline — proves `recordInputs`/`recordOutputs` works with `MessagesAnnotation`)
- **Fails** for `langgraph-custom-state` (surfaces Bug 5 explicitly)

---

## Bug Status

### Bug 1 — `instrumentLangGraph` crashes on compiled graph ✅ Confirmed

**Variant:** `langgraph-compiled`

`createReactAgent()` returns a `CompiledStateGraph`. Calling `instrumentLangGraph` on it immediately throws:

```
TypeError: Cannot read properties of undefined (reading 'bind')
```

The crash happens before any LLM call — no spans are sent, all checks fail with "no spans captured". This mirrors the exact usage pattern shown in Sentry's official docs.

**Test result:** All 4 tests fail (0 spans received).

---

### Bug 2 — Chain spans show as `unknown_chain` ⚠️ Not yet run

**Variant:** `langgraph-langchain`

`handleChainStart` ignores the 8th argument (`runName`). `chain.name` is always undefined, so every chain span is named `unknown_chain` regardless of the actual LangGraph node name.

**Expected test result:** `checkChatSpanAttributes` will fail on span description; `checkAgentSpanAttributes` will fail (no `invoke_agent` span without `instrumentLangGraph`).

---

### Bug 3 — `stream()` produces no `invoke_agent` span ⚠️ Not yet run

**Variant:** `langgraph` (streaming mode)

`instrumentLangGraph` only patches `invoke()`. When using `stream()`, the graph runs with no parent span. The blocking variant should produce an `invoke_agent` span; the streaming variant should not.

**Expected test result:** Blocking tests partially pass (`invoke_agent` span exists); streaming tests fail (no `invoke_agent` span).

---

### Bug 4 — Combined instrumentation drops 4/5 chat spans ⚠️ Not yet run

**Variant:** `langgraph-combined`

Using both `instrumentLangGraph` and `createLangChainCallbackHandler` simultaneously causes most `chat` spans to be silently dropped. Only 1 of N LLM calls produces a `chat` span. Additionally, spurious nested `invoke_agent` sub-spans appear with near-zero durations.

**Expected test result:** `checkChatSpanAttributes` and `checkAgentHierarchy` fail; `checkAgentSpanAttributes` likely passes.

---

### Bug 5 — `recordInputs`/`recordOutputs` silent with custom state ⚠️ Not yet run

**Variant:** `langgraph-custom-state`

`instrumentLangGraph` hardcodes `args[0].messages` to extract inputs/outputs. When the graph uses a custom `Annotation.Root` (e.g. `{ userInput, response }` instead of `messages`), no input/output data is recorded on the `invoke_agent` span — silently.

**Expected test result:** `invoke_agent` span exists but `checkAgentInputOutputMessages` fails — no `gen_ai.input.messages` / `gen_ai.output.messages` on the span.

---

## Happy Path: `langgraph` Blocking — Actual Test Results

**Command:** `npm run test -- --framework langgraph --blocking --verbose`

Basic Agent Test results:

```
✓ checkAgentSpanAttributes        — invoke_agent span exists with gen_ai.agent.name
❗ checkChatSpanAttributes         — no chat spans (expected — instrumentLangGraph alone does not produce them)
✓ checkAgentHierarchy             — hierarchy is correct
✓ checkValidTokenUsage            — token counts present on invoke_agent span
✓ checkInputMessagesSchema        — input messages schema valid
✓ checkAgentInputOutputMessages   — gen_ai.input.messages + gen_ai.output.messages on invoke_agent ✅
⊘ checkResponseModel              — skipped (no chat spans)
```

The `checkAgentInputOutputMessages` check **passes** — `instrumentLangGraph` with `MessagesAnnotation` and `recordInputs/recordOutputs: true` correctly records inputs and outputs on the `invoke_agent` span. `checkChatSpanAttributes` fails as expected since no callback handler is used.

---

## What `instrumentLangGraph` Should Produce (Correct Behavior)

Based on parity with Python LangGraph (which works correctly end-to-end) and Sentry's documented intent, the correct expected output when using `instrumentLangGraph` correctly in the browser is:

```
gen_ai.create_agent  × 1       — from graph.compile()
gen_ai.invoke_agent  × 1       — from graph.invoke()
  ├─ gen_ai.input.messages      — the input passed to the graph
  ├─ gen_ai.output.messages     — the output returned by the graph
  ├─ gen_ai.agent.name
  └─ gen_ai.chat  × N          — one per LLM call inside graph nodes (nested)
       ├─ gen_ai.input.messages
       ├─ gen_ai.output.messages
       ├─ gen_ai.usage.input_tokens
       └─ gen_ai.usage.output_tokens
```

### What each API actually produces today

| Span | `instrumentLangGraph` alone | `createLangChainCallbackHandler` alone | Both together (Bug 4) |
|------|-----------------------------|----------------------------------------|----------------------|
| `create_agent` | ✅ | ❌ | ✅ |
| `invoke_agent` with input/output | ✅ | ❌ | ✅ (buggy hierarchy) |
| `chat` spans | ❌ | ✅ (but `unknown_chain` — Bug 2) | ✅ 1 of N dropped |
| Token usage | on `invoke_agent` only | on `chat` spans | broken |

`instrumentLangGraph` was **not designed to produce `chat` spans** on its own — it only instruments the graph boundary. The design intent is that both APIs are used together, but their combination is broken (Bug 4). The real SDK fix needed is either:

1. Make `instrumentLangGraph` also instrument LLM calls inside nodes (like the Python SDK does automatically), or
2. Fix Bug 4 so both APIs work correctly together without dropping spans

### Span structure comparison across platforms

| Platform | Spans produced |
|----------|---------------|
| **Browser — `instrumentLangGraph`** | `create_agent` + `invoke_agent` (with input/output), no `chat` |
| **Browser — `createLangChainCallbackHandler`** | `chat` spans only (no agent spans) |
| **Python LangGraph** | `invoke_agent` + nested `chat` (full picture, auto-instrumented) |
| **Vercel AI SDK (Next.js)** | `ai.generateText` / `ai.streamText.doStream` (no `create_agent` or `invoke_agent`) |

Next.js Vercel has no `create_agent` or `invoke_agent` at all — each `generateText`/`streamText` call is a single span that acts as both agent and LLM call. The `create_agent` + `invoke_agent` structure is unique to `instrumentLangGraph` in the browser.

---

## Remaining Work

1. **Run remaining 4 variants** to confirm Bugs 2, 3, 4, 5 reproduce as expected
2. **Consider a tool-call variant** — implement ReAct loop with `ToolNode` + conditional edges to cover Tool Call and Tool Error agent tests
3. **File Sentry SDK issues** for each confirmed bug with the test output as reproduction evidence
