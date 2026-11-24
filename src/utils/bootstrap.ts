import crypto from 'node:crypto';
import { PanelDatabase } from '../storage/PanelDatabase';
import { hashPassword } from './crypto';

export async function ensureAdminAccount(db: PanelDatabase): Promise<void> {
  const username = 'lamdayne';
  let user = await db.findUserByUsername(username);
  const now = new Date().toISOString();

  if (!user) {
    const { hash, salt } = hashPassword('Lamdepzai2k11');
    user = {
      id: crypto.randomUUID(),
      username,
      email: 'lamdayne@craftopia.local',
      passwordHash: hash,
      salt,
      role: 'admin',
      createdAt: now,
      updatedAt: now,
    };
    await db.createUser(user);
  }

  const activeSub = await db.getActiveSubscription(user.id);
  if (!activeSub || activeSub.maxBots < 999_999) {
    await db.activateSubscription({
      id: crypto.randomUUID(),
      userId: user.id,
      planId: 'ultra',
      status: 'active',
      maxBots: 999_999,
      startsAt: now,
      expiresAt: '2099-12-31T23:59:59.000Z',
      createdAt: now,
    });
  }
}
