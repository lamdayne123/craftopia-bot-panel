import { createPanelApp } from '../src/api/app';
import { ensureAdminAccount } from '../src/utils/bootstrap';

const ctx = createPanelApp();
let initPromise: Promise<void> | null = null;

export default async function handler(req: any, res: any) {
  try {
    if (!initPromise) {
      initPromise = (async () => {
        await ctx.db.init();
        await ensureAdminAccount(ctx.db);
      })();
    }
    await initPromise;
    return ctx.app(req, res);
  } catch (err) {
    initPromise = null;
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Vercel Handler Error]', message);
    if (!res.headersSent) {
      res.status(500).json({ error: `Server initialization failed: ${message}` });
    }
  }
}
