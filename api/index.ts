import { createPanelApp } from '../src/api/app';
import { ensureAdminAccount } from '../src/utils/bootstrap';

const ctx = createPanelApp();
let initialized = false;

export default async function handler(req: any, res: any) {
  if (!initialized) {
    await ctx.db.init();
    await ensureAdminAccount(ctx.db);
    initialized = true;
  }
  return ctx.app(req, res);
}
