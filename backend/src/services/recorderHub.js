import { randomBytes } from 'crypto';
import { ingestAction, actionsToSteps, stepsToActions } from './recorderPipeline.js';

/** @typedef {'ui' | 'ext'} ClientRole */

/**
 * @typedef {object} RecorderSession
 * @property {number} userId
 * @property {string} connectKey
 * @property {import('ws').WebSocket | null} ui
 * @property {import('ws').WebSocket | null} ext
 * @property {boolean} recording
 * @property {boolean} paused
 * @property {object[]} steps
 * @property {object} config
 * @property {object|null} storageState
 * @property {number} createdAt
 */

const sessions = new Map();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function randomId(bytes = 4) {
  return randomBytes(bytes).toString('hex');
}

function cleanupSessions() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > SESSION_TTL_MS) {
      try { s.ui?.close(); } catch (_) {}
      try { s.ext?.close(); } catch (_) {}
      sessions.delete(id);
    }
  }
}

setInterval(cleanupSessions, 60_000);

export function createRecorderSession(userId) {
  cleanupSessions();
  const sessionId = randomId(4);
  const connectKey = randomId(8);
  /** @type {RecorderSession} */
  const session = {
    userId,
    connectKey,
    ui: null,
    ext: null,
    recording: false,
    paused: false,
    steps: [],
    actions: [],
    config: {
      language: 'typescript',
      ariaSelectors: true,
      device: { width: 1280, height: 720 },
    },
    storageState: null,
    createdAt: Date.now(),
  };
  sessions.set(sessionId, session);
  return { sessionId, connectKey };
}

export function getRecorderSession(sessionId) {
  return sessions.get(sessionId) || null;
}

function relay(session, fromRole, payload) {
  const target = fromRole === 'ui' ? session.ext : session.ui;
  if (target?.readyState === 1) {
    target.send(JSON.stringify(payload));
  }
}

function broadcast(session, payload) {
  for (const client of [session.ui, session.ext]) {
    if (client?.readyState === 1) client.send(JSON.stringify(payload));
  }
}

function handleUiMessage(session, msg) {
  if (msg.type === 'command') {
    const action = msg.action;
    if (action === 'start') {
      session.recording = true;
      session.paused = false;
      const cfg = msg.config || msg.payload;
      if (cfg && typeof cfg === 'object') {
        if (typeof cfg.device === 'string' && cfg.device.includes('x')) {
          const [width, height] = cfg.device.split('x').map((n) => Number(n) || 0);
          session.config = { ...session.config, device: { width: width || 1280, height: height || 720 } };
        } else {
          session.config = { ...session.config, ...cfg };
        }
      }
    } else if (action === 'pause') {
      session.paused = !session.paused;
    } else if (action === 'stop') {
      session.recording = false;
      session.paused = false;
    } else if (action === 'clear') {
      session.steps = [];
      session.actions = [];
      broadcast(session, { type: 'steps', steps: [] });
    }
    relay(session, 'ui', msg);
    broadcast(session, {
      type: 'status',
      recording: session.recording,
      paused: session.paused,
      stepsCount: session.steps.length,
    });
    return;
  }
  if (msg.type === 'steps' && Array.isArray(msg.steps)) {
    session.steps = msg.steps;
    session.actions = stepsToActions(msg.steps);
    broadcast(session, { type: 'steps', steps: session.steps });
    return;
  }
  if (msg.type === 'deleteStep' && typeof msg.index === 'number') {
    session.steps.splice(msg.index, 1);
    session.actions = stepsToActions(session.steps);
    broadcast(session, { type: 'steps', steps: session.steps });
    return;
  }
  relay(session, 'ui', msg);
}

function handleExtMessage(session, msg) {
  if (msg.type === 'action' && msg.action && !session.paused) {
    const { changed, actions } = ingestAction(session.actions || [], msg.action);
    if (!changed) return;
    session.actions = actions;
    session.steps = actionsToSteps(actions);
    broadcast(session, { type: 'steps', steps: session.steps });
    broadcast(session, {
      type: 'status',
      recording: session.recording,
      paused: session.paused,
      stepsCount: session.steps.length,
    });
    return;
  }
  if (msg.type === 'step' && msg.step) {
    const { changed, actions } = ingestAction(session.actions || [], msg.step);
    if (!changed) return;
    session.actions = actions;
    session.steps = actionsToSteps(actions);
    broadcast(session, { type: 'steps', steps: session.steps });
    broadcast(session, {
      type: 'status',
      recording: session.recording,
      paused: session.paused,
      stepsCount: session.steps.length,
      lastUrl: msg.step.url || null,
    });
    return;
  }
  if (msg.type === 'status') {
    broadcast(session, { ...msg, stepsCount: session.steps.length });
    return;
  }
  if (msg.type === 'assertDraft' && msg.target) {
    if (session.ui?.readyState === 1) {
      session.ui.send(JSON.stringify({ type: 'assertDraft', target: msg.target }));
    }
    return;
  }
  if (msg.type === 'storageState' && msg.storageState) {
    session.storageState = msg.storageState;
    if (session.ui?.readyState === 1) {
      session.ui.send(JSON.stringify({
        type: 'storageState',
        storageState: msg.storageState,
        cookieCount: msg.cookieCount ?? msg.storageState?.cookies?.length ?? 0,
      }));
    }
    return;
  }
  if (msg.type === 'steps') {
    session.steps = Array.isArray(msg.steps) ? msg.steps : [];
    session.actions = stepsToActions(session.steps);
    broadcast(session, { type: 'steps', steps: session.steps });
    return;
  }
  relay(session, 'ext', msg);
}

/**
 * @param {import('ws').WebSocket} ws
 * @param {{ sessionId: string, role: ClientRole, connectKey?: string, userId?: number }} opts
 */
export function attachRecorderClient(ws, { sessionId, role, connectKey, userId }) {
  const session = sessions.get(sessionId);
  if (!session) {
    ws.close(4004, 'session not found');
    return;
  }

  if (role === 'ui') {
    if (!userId || session.userId !== userId) {
      ws.close(4003, 'unauthorized');
      return;
    }
    if (session.ui && session.ui !== ws && session.ui.readyState === 1) {
      try { session.ui.close(4000, 'replaced'); } catch (_) {}
    }
    session.ui = ws;
  } else {
    if (!connectKey || connectKey !== session.connectKey) {
      ws.close(4003, 'invalid key');
      return;
    }
    if (session.ext && session.ext !== ws && session.ext.readyState === 1) {
      try { session.ext.close(4000, 'replaced'); } catch (_) {}
    }
    session.ext = ws;
  }

  ws.send(JSON.stringify({
    type: 'hello',
    role,
    sessionId,
    steps: session.steps,
    storageState: session.storageState,
    cookieCount: session.storageState?.cookies?.length ?? 0,
    status: {
      recording: session.recording,
      paused: session.paused,
      stepsCount: session.steps.length,
      uiConnected: session.ui?.readyState === 1,
      extConnected: session.ext?.readyState === 1,
    },
  }));

  const peer = role === 'ui' ? session.ext : session.ui;
  const otherRole = role === 'ui' ? 'ext' : 'ui';
  if (peer?.readyState === 1) {
    ws.send(JSON.stringify({ type: 'peer', role: otherRole, connected: true }));
  }
  const notifyPeer = role === 'ui' ? session.ext : session.ui;
  if (notifyPeer?.readyState === 1) {
    notifyPeer.send(JSON.stringify({ type: 'peer', role, connected: true }));
  }

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch (_) { return; }
    if (role === 'ui') handleUiMessage(session, msg);
    else handleExtMessage(session, msg);
  });

  ws.on('close', () => {
    if (role === 'ui' && session.ui === ws) session.ui = null;
    if (role === 'ext' && session.ext === ws) session.ext = null;
    const other = role === 'ui' ? session.ext : session.ui;
    if (other?.readyState === 1) {
      other.send(JSON.stringify({
        type: 'peer',
        role,
        connected: false,
      }));
    }
  });
}

export function closeRecorderSession(sessionId, userId) {
  const session = sessions.get(sessionId);
  if (!session || session.userId !== userId) return false;
  try { session.ui?.close(); } catch (_) {}
  try { session.ext?.close(); } catch (_) {}
  sessions.delete(sessionId);
  return true;
}
