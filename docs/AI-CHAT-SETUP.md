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
- NVIDIA NIM: default model `meta/llama-3.2-3b-instruct`. NVIDIA uses the OpenAI-compatible endpoint at `https://integrate.api.nvidia.com/v1/chat/completions`.
- Ollama (laptop): default model `qwen2.5:3b-instruct`. Ollama runs on the computer hosting the local Vite server, so no API key is needed. The phone must open the local Vite URL over the same Wi-Fi network; the public Vercel deployment cannot reach a laptop's `localhost`.

The model field is editable, so a provider model can be changed later without changing code.

### Ollama on a laptop

1. Install Ollama on the laptop and run `ollama pull qwen2.5:3b-instruct`.
2. Start Smriti locally with `npm run dev`.
3. Open the laptop's local URL from the phone while both devices are on the same Wi-Fi.
4. In Smriti Settings → AI Configuration, choose **Ollama (laptop)**, keep `qwen2.5:3b-instruct`, and select **Use Ollama**.

Ollama uses the laptop's available GPU automatically. If no GPU is available, it can fall back to the CPU, but responses will be slower. Do not expose port 11434 directly to the public internet; use the local Vite proxy or a protected VPN/reverse proxy.

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
