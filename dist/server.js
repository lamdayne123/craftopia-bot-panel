"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const app_1 = require("./api/app");
const LocalBotRunner_1 = require("./services/LocalBotRunner");
const bootstrap_1 = require("./utils/bootstrap");
const NODE_PING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const ctx = (0, app_1.createPanelApp)();
let initPromise = null;
async function ensureReady() {
    if (!initPromise) {
        initPromise = (async () => {
            await ctx.db.init();
            await (0, bootstrap_1.ensureAdminAccount)(ctx.db);
        })();
    }
    await initPromise;
}
// Vercel serverless entrypoint compatibility (if Vercel uses dist/server.js as root entrypoint)
async function handler(req, res) {
    try {
        await ensureReady();
        return ctx.app(req, res);
    }
    catch (err) {
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
                    if (bot.workerId === LocalBotRunner_1.LOCAL_PANEL_WORKER_ID &&
                        bot.status !== 'STOPPED' &&
                        bot.reconnect?.enabled !== false) {
                        await ctx.localRunner.ensureBotRunning(bot).catch(() => { });
                        await new Promise((r) => setTimeout(r, 250));
                    }
                }
            }
            catch {
                // non-fatal startup recovery
            }
        })();
    }, 1500).unref();
    // Every 5 minutes: ping node health, migrate stale workers, and auto-reconnect dropped bots
    setInterval(() => {
        void ctx.orchestrator.runPeriodicNodePingAndRecovery((bot) => ctx.localRunner.ensureBotRunning(bot), (botId) => ctx.localRunner.isRunningLocally(botId));
    }, NODE_PING_INTERVAL_MS).unref();
    const port = Number(process.env.PORT || 3000);
    ctx.app.listen(port, () => {
        console.log(`[Craftopia SaaS Panel] Listening on http://localhost:${port}`);
    });
}
if (!process.env.VERCEL) {
    void main();
}
