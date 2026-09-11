# Smriti AI chat setup

Smriti now includes a private, local chat history and an optional AI assistant.

## Run locally

1. Install dependencies with `npm install`.
2. Start the app with `npm run dev`.
3. Open `/chat`.
4. Open Settings → AI Configuration.
5. Paste your provider API key, choose the provider and model, then select **Save API Key**.
6. Select **Test API Key**, then return to Chat.

No source-code edit or environment variable is needed for a personal key.

## Supported providers

- OpenAI: default model `gpt-4o-mini`.
- Qwen / DashScope: default model `qwen-plus`.
- OpenRouter: default model `openai/gpt-4o-mini`. OpenRouter model IDs use the `provider/model` format; you can replace this with any model available in your OpenRouter account.

The model field is editable, so a provider model can be changed later without changing code.

## Security boundary

- The key is stored in the browser's IndexedDB app storage, not localStorage, chat history, or the URL.
- The browser sends the key only in the request body to the same-origin `/api/chat` endpoint.
- The server endpoint forwards the request to the selected provider and returns only the assistant response.
- Provider credentials are never written to logs or returned in error messages.
- Vercel uses `api/chat.ts`; local Vite development uses the matching middleware in `vite.config.ts`.

The key is still a user secret held by the browser. Use a dedicated key with appropriate provider limits and remove or rotate it in the provider dashboard if the device is shared or lost.

## Chat behavior

- Conversations and messages persist locally in IndexedDB.
- **New Chat** starts a separate conversation.
- The trash button deletes a conversation; **Clear** resets the active one.
- Enter sends a message; Shift+Enter creates a new line.
- Assistant Markdown supports paragraphs, bold text, inline code, fenced code blocks, basic syntax coloring, and copy buttons.
