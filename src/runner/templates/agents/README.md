# Agent assessment adapters

Agent adapters execute the shared `agent.*` probe catalog through an agent framework.

Each adapter must:

- extend the matching `base.<platform>.assessment.njk` harness
- initialize the framework once in `dynamic_imports`
- execute every request in `probe.input.calls`
- use `request.model`, `request.messages`, `request.streaming`, and `request.conversationId` when applicable
- implement deterministic add, multiply, and throwing tools for tool probes
- preserve expected tool errors locally while rethrowing unexpected provider or harness errors

The platform base owns lifecycle events, root spans, continuation, blocked probes, and flushing. Keep equivalent agent behavior aligned across JavaScript and Python.

Validate an adapter with:

```bash
npm run build
npm test -- render --category agents --framework <name>
```
