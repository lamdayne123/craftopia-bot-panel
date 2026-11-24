"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingService = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const crypto_1 = require("../utils/crypto");
class BillingService {
    db;
    constructor(db) {
        this.db = db;
    }
    async listPlans() {
        return this.db.listPlans();
    }
    async getActiveSubscription(userId) {
        return this.db.getActiveSubscription(userId);
    }
    async getSlotQuota(userId) {
        const [sub, bots, user] = await Promise.all([
            this.db.getActiveSubscription(userId),
            this.db.listBotsByOwner(userId),
            this.db.findUserById(userId),
        ]);
        // Admin accounts get unlimited bot slots across all plans; normal users require an active subscription
        const isAdmin = user?.role === 'admin';
        const maxBots = isAdmin ? Math.max(999_999, sub?.maxBots ?? 0) : sub ? sub.maxBots : 0;
        const usedBots = bots.length;
        return {
            maxBots,
            usedBots,
            remainingSlots: Math.max(0, maxBots - usedBots),
            subscription: sub,
        };
    }
    async createCheckout(userId, planId, provider, idempotencyKey) {
        const plan = await this.db.getPlan(planId);
        if (!plan || !plan.active) {
            throw new Error('Gói thuê không tồn tại hoặc đã ngừng bán.');
        }
        const existing = await this.db.getPaymentByIdempotencyKey(idempotencyKey);
        if (existing) {
            return {
                payment: existing,
                plan,
                webhookConfigured: Boolean(process.env.PAYMENT_WEBHOOK_SECRET),
            };
        }
        const payment = {
            id: node_crypto_1.default.randomUUID(),
            userId,
            planId: plan.id,
            amountVnd: plan.priceVnd, // Always authoritative from DB, never from client
            provider,
            idempotencyKey,
            status: 'pending',
            verifiedAt: null,
            createdAt: new Date().toISOString(),
        };
        await this.db.createPayment(payment);
        await this.db.appendAuditLog({
            id: node_crypto_1.default.randomUUID(),
            actorId: userId,
            action: 'CHECKOUT_CREATED',
            targetType: 'payment',
            targetId: payment.id,
            detail: `Tạo giao dịch ${plan.name} (${plan.priceVnd}đ / ${plan.maxBots} bot)`,
            createdAt: new Date().toISOString(),
        });
        return {
            payment,
            plan,
            webhookConfigured: Boolean(process.env.PAYMENT_WEBHOOK_SECRET),
        };
    }
    async verifyPaymentWebhook(rawBody, signatureHex, paymentId) {
        const secret = process.env.PAYMENT_WEBHOOK_SECRET?.trim();
        if (!secret) {
            throw new Error('PAYMENT_WEBHOOK_SECRET chưa được cấu hình ở backend.');
        }
        if (!signatureHex || !(0, crypto_1.verifyHmacSignature)(rawBody, signatureHex, secret)) {
            throw new Error('Chữ ký webhook thanh toán không hợp lệ.');
        }
        const payment = await this.db.getPaymentById(paymentId);
        if (!payment) {
            throw new Error('Không tìm thấy giao dịch.');
        }
        if (payment.status === 'paid') {
            const existingSub = await this.db.getActiveSubscription(payment.userId);
            if (existingSub)
                return { payment, subscription: existingSub };
        }
        const plan = await this.db.getPlan(payment.planId);
        if (!plan)
            throw new Error('Gói thuê không hợp lệ.');
        const now = new Date();
        const expires = new Date(now.getTime() + plan.durationDays * 86400_000);
        const subscription = {
            id: node_crypto_1.default.randomUUID(),
            userId: payment.userId,
            planId: plan.id,
            status: 'active',
            maxBots: plan.maxBots,
            startsAt: now.toISOString(),
            expiresAt: expires.toISOString(),
            createdAt: now.toISOString(),
        };
        const verified = await this.db.markPaymentPaidAndActivateSubscription(payment.id, subscription);
        await this.db.appendAuditLog({
            id: node_crypto_1.default.randomUUID(),
            actorId: payment.userId,
            action: 'SUBSCRIPTION_ACTIVATED',
            targetType: 'subscription',
            targetId: subscription.id,
            detail: `Kích hoạt gói ${plan.name} (${plan.maxBots} bot, ${plan.durationDays} ngày)`,
            createdAt: now.toISOString(),
        });
        return { payment: verified, subscription };
    }
}
exports.BillingService = BillingService;
