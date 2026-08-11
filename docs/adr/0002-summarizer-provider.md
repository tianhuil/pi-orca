# Tab-title summarization uses a self-registered free zen provider, not pi's configured models

The extension registers its own provider with `pi.registerProvider()` — model `mimo-v2.5-free` at `https://opencode.ai/zen/v1`, `api: "openai-completions"`, `apiKey: "public"`, `compat: { supportsStore: false, supportsDeveloperRole: false, maxTokensField: "max_tokens" }` — and summarizes through `ctx.modelRegistry.find(...)` + `complete()`. It does not read `~/.pi/agent/models.json` and never touches pi's `defaultModel`.

Why: the title should work on any machine with zero model configuration (no keys, no dotfiles), and naming is deliberately delegated to the free mimo model rather than the session's paid/default model. The prompt asks for output of **less than 50 characters**; the result is post-processed (strip newlines/quotes, truncate on a codepoint boundary). If the model call fails, the fallback is the message's first line truncated to 50 — there is no second model in the chain.
