import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { handleAIChat } from './server/aiChatHandler';

function localAIEndpoint(): Plugin {
  return {
    name: 'smriti-local-ai-endpoint',
    configureServer(server) {
      server.middlewares.use('/api/chat', (req, res, next) => {
        if (req.method !== 'POST') {
          next();
          return;
        }
        let raw = '';
        req.on('data', (chunk) => { raw += String(chunk); });
        req.on('end', async () => {
          try {
            const result = await handleAIChat(JSON.parse(raw));
            res.statusCode = result.status;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result.body));
          } catch {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'The AI request could not be completed.' }));
          }
        });
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Read the two public Vite variables explicitly. Do not alias other
  // environment-variable names or expose any service-role value.
  const env = loadEnv(mode, process.cwd(), '');
  // Vercel's Supabase integration may provide the same public values under
  // SUPABASE_* or NEXT_PUBLIC_* names. Keep VITE_* as the local/deployment
  // override, but safely fall back to anon/publishable values only.
  const supabaseUrl = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '';
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || '';

  return {
    plugins: [react(), localAIEndpoint()],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      host: true,
    },
  };
});
