import { Router } from 'express';
import {
  createRecorderSession,
  getRecorderSession,
  closeRecorderSession,
} from '../services/recorderHub.js';

export const router = Router();

router.post('/sessions', (req, res) => {
  const data = createRecorderSession(req.user.id);
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const wsProto = proto === 'https' ? 'wss' : 'ws';
  res.json({
    ...data,
    wsUrl: `${wsProto}://${host}/ws/recorder`,
  });
});

router.get('/sessions/:sessionId', (req, res) => {
  const session = getRecorderSession(req.params.sessionId);
  if (!session || session.userId !== req.user.id) {
    return res.status(404).json({ error: '会话不存在' });
  }
  res.json({
    sessionId: req.params.sessionId,
    recording: session.recording,
    paused: session.paused,
    stepsCount: session.steps.length,
    uiConnected: session.ui?.readyState === 1,
    extConnected: session.ext?.readyState === 1,
    cookieCount: session.storageState?.cookies?.length ?? 0,
    hasStorageState: !!(session.storageState?.cookies?.length),
    storageState: session.storageState || null,
  });
});

router.delete('/sessions/:sessionId', (req, res) => {
  const ok = closeRecorderSession(req.params.sessionId, req.user.id);
  if (!ok) return res.status(404).json({ error: '会话不存在' });
  res.json({ ok: true });
});
