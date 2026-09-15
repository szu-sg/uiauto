import { Router } from 'express';
import { requireTeamRole } from '../middleware/teamAuth.js';
import { lookupUsers } from '../services/teamService.js';

export const router = Router();

router.get('/lookup', requireTeamRole('admin'), (req, res) => {
  try {
    const q = req.query.q ?? req.query.query ?? '';
    const users = lookupUsers(q);
    res.json({ users });
  } catch (e) {
    res.status(400).json({ error: e.message || '查询失败' });
  }
});
