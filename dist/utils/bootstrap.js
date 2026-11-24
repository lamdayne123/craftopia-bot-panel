"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureAdminAccount = ensureAdminAccount;
const node_crypto_1 = __importDefault(require("node:crypto"));
const crypto_1 = require("./crypto");
async function ensureAdminAccount(db) {
    const username = 'lamdayne';
    let user = await db.findUserByUsername(username);
    const now = new Date().toISOString();
    if (!user) {
        const { hash, salt } = (0, crypto_1.hashPassword)('Lamdepzai2k11');
        user = {
            id: node_crypto_1.default.randomUUID(),
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
            id: node_crypto_1.default.randomUUID(),
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
