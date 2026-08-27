# LLM assessment adapters

LLM adapters execute the shared `llm.*` probe catalog through a direct model SDK.

Each adapter must:

- extend the matching `base.<platform>.assessment.njk` harness
- initialize the SDK client once in `dynamic_imports`
- execute every request in `probe.input.calls`
- pass `request.model` and `request.messages`
- consume both blocking and streaming responses when requested
- apply `request.conversationId` when the runtime supports conversation tracking
- capture the intentional provider error locally and rethrow unexpected errors

The platform base owns lifecycle events, root spans, continuation, blocked probes, and flushing. Keep equivalent request semantics aligned across JavaScript and Python.

Validate an adapter with:

```bash
npm run build
npm test -- render --category llm --framework <name>
```
