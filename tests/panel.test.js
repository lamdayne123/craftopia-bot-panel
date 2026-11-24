const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PanelDatabase } = require('../dist/storage/PanelDatabase');
const { RealtimePublisher } = require('../dist/services/RealtimePublisher');
const { OrchestratorService } = require('../dist/services/OrchestratorService');
const { createPanelApp } = require('../dist/api/app');

test('Craftopia SaaS Panel: auth, anti-IDOR, store webhook, slot limits, worker token revocation, and auto-migration', async () => {
  process.env.PAYMENT_WEBHOOK_SECRET = 'test-webhook-secret-123';
  process.env.CREDENTIAL_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'craftopia-saas-panel-'));
  const db = new PanelDatabase(dataDir);
  await db.init();

  const realtime = new RealtimePublisher();
  const orchestrator = new OrchestratorService(db, realtime, {
    heartbeatTimeoutMs: 50,
    migrationCooldownMs: 0,
  });
  const { app } = createPanelApp({ db, realtime, orchestrator });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    // 1. Register admin (first user) & normal user (second user)
    const adminReg = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin1', email: 'admin1@test.local', password: 'StrongPassword123' }),
    });
    assert.equal(adminReg.status, 201);
    const adminCookie = adminReg.headers.get('set-cookie').split(';')[0];

    const userReg = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'user2', email: 'user2@test.local', password: 'StrongPassword123' }),
    });
    assert.equal(userReg.status, 201);
    const userCookie = userReg.headers.get('set-cookie').split(';')[0];

    // Normal user cannot access admin routes
    const forbiddenAdmin = await fetch(`${baseUrl}/api/admin/workers`, { headers: { Cookie: userCookie } });
    assert.equal(forbiddenAdmin.status, 403);

    // 2. Admin creates 2 workers & sends heartbeats
    const w1Res = await fetch(`${baseUrl}/api/admin/workers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ name: 'Worker-1', maxBots: 2 }),
    });
    const w1Data = await w1Res.json();

    const w2Res = await fetch(`${baseUrl}/api/admin/workers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ name: 'Worker-2', maxBots: 2 }),
    });
    const w2Data = await w2Res.json();

    await fetch(`${baseUrl}/api/worker/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${w1Data.workerToken}`,
        'x-worker-id': w1Data.worker.id,
      },
      body: JSON.stringify({ activeBots: 0, maxBots: 2, rssMb: 90, heapUsedMb: 25, eventLoopLagMs: 1 }),
    });

    await fetch(`${baseUrl}/api/worker/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${w2Data.workerToken}`,
        'x-worker-id': w2Data.worker.id,
      },
      body: JSON.stringify({ activeBots: 0, maxBots: 2, rssMb: 85, heapUsedMb: 22, eventLoopLagMs: 1 }),
    });

    // 3. Bedrock rejected as Coming Soon
    const bedrockRes = await fetch(`${baseUrl}/api/bots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({
        engine: 'bedrock',
        name: 'BedrockBot',
        mcUsername: 'BedrockBot',
        host: 'play.example.com',
      }),
    });
    assert.equal(bedrockRes.status, 400);

    // 4. User without an active plan CANNOT create a bot (0 slots -> 403)
    const noPlanRes = await fetch(`${baseUrl}/api/bots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({
        idempotencyKey: 'idem-no-plan',
        engine: 'java',
        name: 'BlockedBot',
        mcUsername: 'BlockedBot',
        host: 'play.craftopia.vn',
      }),
    });
    assert.equal(noPlanRes.status, 403);

    // 5. Store checkout + tampered webhook rejected + valid HMAC webhook activates Basic (5 bots)
    const chkRes = await fetch(`${baseUrl}/api/payments/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({ planId: 'basic', idempotencyKey: 'pay-idem-1' }),
    });
    const { payment } = await chkRes.json();
    assert.equal(payment.amountVnd, 10000);

    const hookBody = JSON.stringify({ paymentId: payment.id });
    const badHook = await fetch(`${baseUrl}/api/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-signature': 'deadbeef' },
      body: hookBody,
    });
    assert.equal(badHook.status, 403);

    const validSig = crypto.createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET).update(hookBody).digest('hex');
    const goodHook = await fetch(`${baseUrl}/api/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-signature': validSig },
      body: hookBody,
    });
    assert.equal(goodHook.status, 200);

    // 6. Now user can create Java bot & idempotency works
    const botRes = await fetch(`${baseUrl}/api/bots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({
        idempotencyKey: 'idem-bot-1',
        engine: 'java',
        name: 'AlphaJava',
        mcUsername: 'AlphaJava',
        host: 'play.craftopia.vn',
        port: 25565,
        version: '1.21.4',
        serverPassword: 'SecretBotPassword!9',
        autoAuth: { autoRegister: true, autoLogin: true },
      }),
    });
    assert.equal(botRes.status, 201);
    const { bot: createdBot } = await botRes.json();
    assert.ok(!JSON.stringify(createdBot).includes('SecretBotPassword!9'));

    const dupRes = await fetch(`${baseUrl}/api/bots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({
        idempotencyKey: 'idem-bot-1',
        engine: 'java',
        name: 'AlphaJava',
        mcUsername: 'AlphaJava',
        host: 'play.craftopia.vn',
      }),
    });
    const dupData = await dupRes.json();
    assert.equal(dupData.deduplicated, true);
    assert.equal(dupData.bot.id, createdBot.id);

    // 2nd bot succeeds within 5-bot Basic plan!
    const bot2Res = await fetch(`${baseUrl}/api/bots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({
        idempotencyKey: 'idem-bot-2',
        engine: 'java',
        name: 'BetaJava',
        mcUsername: 'BetaJava',
        host: 'play.craftopia.vn',
      }),
    });
    assert.equal(bot2Res.status, 201);

    // 7. Anti-IDOR: another normal user cannot start/delete user2's bot
    const user3Reg = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'user3', email: 'user3@test.local', password: 'StrongPassword123' }),
    });
    const user3Cookie = user3Reg.headers.get('set-cookie').split(';')[0];
    const idorRes = await fetch(`${baseUrl}/api/bots/${createdBot.id}/stop`, {
      method: 'POST',
      headers: { Cookie: user3Cookie },
    });
    assert.equal(idorRes.status, 403);

    // 8. Auto-Migration when Worker 1 goes stale (heartbeat timeout = 50ms)
    const assignedWorker = createdBot.workerId;
    const otherWorker = assignedWorker === w1Data.worker.id ? w2Data.worker.id : w1Data.worker.id;
    const otherToken = assignedWorker === w1Data.worker.id ? w2Data.workerToken : w1Data.workerToken;

    await new Promise((r) => setTimeout(r, 80));
    // Refresh only the healthy worker's heartbeat so the other becomes stale
    await fetch(`${baseUrl}/api/worker/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${otherToken}`,
        'x-worker-id': otherWorker,
      },
      body: JSON.stringify({ activeBots: 0, maxBots: 2, rssMb: 85, heapUsedMb: 22, eventLoopLagMs: 1 }),
    });

    const migRes = await fetch(`${baseUrl}/api/admin/migrate`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    });
    const migReport = await migRes.json();
    assert.ok(migReport.migratedBots.some((m) => m.botId === createdBot.id && m.toWorkerId === otherWorker));

    const migratedBot = await db.getBotById(createdBot.id);
    assert.equal(migratedBot.id, createdBot.id);
    assert.equal(migratedBot.workerId, otherWorker);

    // 9. Revoked worker token rejected
    await fetch(`${baseUrl}/api/admin/workers/${otherWorker}/revoke`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    });
    const revokedHb = await fetch(`${baseUrl}/api/worker/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${otherToken}`,
        'x-worker-id': otherWorker,
      },
      body: JSON.stringify({ activeBots: 0, maxBots: 2 }),
    });
    assert.equal(revokedHb.status, 401);
  } finally {
    await db.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
