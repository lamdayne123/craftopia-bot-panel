"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./api/app");
const LocalBotRunner_1 = require("./services/LocalBotRunner");
const bootstrap_1 = require("./utils/bootstrap");
const NODE_PING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
async function main() {
    const ctx = (0, app_1.createPanelApp)();
    await ctx.db.init();
    await (0, bootstrap_1.ensureAdminAccount)(ctx.db);
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
void main();
