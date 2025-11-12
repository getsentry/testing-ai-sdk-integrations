This repo (hopefully) contains everything needed to test Sentry SDKs. AI integrations for Python and JavaScript are currently supported.

Quick start and other goodies can be found in (./README.md).

The entire repo was made with Claude Code, and all of the major changes (like refactorings, adding SDKs, etc.) should be done by an agent. Most directories contain README.md files that the agent is instructed to read and update when needed.

### JS vs. Py

Some parts of the test logic are implemented twice (once for JS and once for Python). They can never be exactly the same, but it is vital that they are as close to each other as possible in terms of overall functionality, file names, function names, variable names, etc.

### Adding another AI SDK integration

- Should be a matter of prompting an agent to do so.
- Make sure to repeat that it should be consistent with the other SDKs.
- Double-check if it wrote BS tests just to have them pass.
- Make sure it DID NOT change any fixtures or validators to make the tests pass.
- Make sure the package versions are pinned.

### Adding more test cases

- The fixture should be written and double-checked by a human.
- The case should be implemented for all SDKs where it makes sense.
- If needed, it can be split into 2 flavors - "agentic" and "low-level."

### Versioning

- Every SDK has an independent Sentry SDK installation. This can be using the CLI but if you do so, make sure that the bersion is bumped everywhere.
