import crypto from 'node:crypto';
import { PanelDatabase } from '../storage/PanelDatabase';
import { PaymentRecord, PlanRecord, SubscriptionRecord } from '../types';
import { verifyHmacSignature } from '../utils/crypto';

export class BillingService {
  constructor(private readonly db: PanelDatabase) {}

  public async listPlans(): Promise<PlanRecord[]> {
    return this.db.listPlans();
  }

  public async getActiveSubscription(userId: string): Promise<SubscriptionRecord | null> {
    return this.db.getActiveSubscription(userId);
  }

  public async getSlotQuota(userId: string): Promise<{ maxBots: number; usedBots: number; remainingSlots: number; subscription: SubscriptionRecord | null }> {
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

  public async createCheckout(
    userId: string,
    planId: string,
    provider: string,
    idempotencyKey: string
  ): Promise<{ payment: PaymentRecord; plan: PlanRecord; webhookConfigured: boolean }> {
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

    const payment: PaymentRecord = {
      id: crypto.randomUUID(),
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
      id: crypto.randomUUID(),
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

  public async verifyPaymentWebhook(
    rawBody: string,
    signatureHex: string,
    paymentId: string
  ): Promise<{ payment: PaymentRecord; subscription: SubscriptionRecord }> {
    const secret = process.env.PAYMENT_WEBHOOK_SECRET?.trim();
    if (!secret) {
      throw new Error('PAYMENT_WEBHOOK_SECRET chưa được cấu hình ở backend.');
    }
    if (!signatureHex || !verifyHmacSignature(rawBody, signatureHex, secret)) {
      throw new Error('Chữ ký webhook thanh toán không hợp lệ.');
    }

    const payment = await this.db.getPaymentById(paymentId);
    if (!payment) {
      throw new Error('Không tìm thấy giao dịch.');
    }

    if (payment.status === 'paid') {
      const existingSub = await this.db.getActiveSubscription(payment.userId);
      if (existingSub) return { payment, subscription: existingSub };
    }

    const plan = await this.db.getPlan(payment.planId);
    if (!plan) throw new Error('Gói thuê không hợp lệ.');

    const now = new Date();
    const expires = new Date(now.getTime() + plan.durationDays * 86400_000);
    const subscription: SubscriptionRecord = {
      id: crypto.randomUUID(),
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
      id: crypto.randomUUID(),
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
