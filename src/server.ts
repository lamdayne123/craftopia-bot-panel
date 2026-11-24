import { createPanelApp } from './api/app';
import { LOCAL_PANEL_WORKER_ID } from './services/LocalBotRunner';
import { ensureAdminAccount } from './utils/bootstrap';

const NODE_PING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const ctx = createPanelApp();
let initPromise: Promise<void> | null = null;

async function ensureReady(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await ctx.db.init();
      await ensureAdminAccount(ctx.db);
    })();
  }
  await initPromise;
}

// Vercel serverless entrypoint compatibility (if Vercel uses dist/server.js as root entrypoint)
export default async function handler(req: any, res: any) {
  try {
    await ensureReady();
    return ctx.app(req, res);
  } catch (err) {
    initPromise = null;
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Server Handler Error]', message);
    if (!res.headersSent) {
      res.status(500).json({ error: `Server initialization failed: ${message}` });
    }
  }
}

async function main() {
  await ensureReady();

  // Auto-restart local-panel-core bots that were active before hosting/panel restart
  setTimeout(() => {
    void (async () => {
      try {
        const bots = await ctx.db.listAllBots();
        for (const bot of bots) {
          if (
            bot.workerId === LOCAL_PANEL_WORKER_ID &&
            bot.status !== 'STOPPED' &&
            bot.reconnect?.enabled !== false
          ) {
            await ctx.localRunner.ensureBotRunning(bot).catch(() => {});
            await new Promise((r) => setTimeout(r, 250));
          }
        }
      } catch {
        // non-fatal startup recovery
      }
    })();
  }, 1500).unref();

  // Every 5 minutes: ping node health, migrate stale workers, and auto-reconnect dropped bots
  setInterval(() => {
    void ctx.orchestrator.runPeriodicNodePingAndRecovery(
      (bot) => ctx.localRunner.ensureBotRunning(bot),
      (botId) => ctx.localRunner.isRunningLocally(botId)
    );
  }, NODE_PING_INTERVAL_MS).unref();

  const port = Number(process.env.PORT || 3000);
  ctx.app.listen(port, () => {
    console.log(`[Craftopia SaaS Panel] Listening on http://localhost:${port}`);
  });
}

if (!process.env.VERCEL) {
  void main();
}
