function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'Content-Type',
      ...extraHeaders
    }
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch (err) {
    return {};
  }
}

function buildActiveReplyPrompt(lastMessage, minutesPassed) {
  if (lastMessage && lastMessage.role === 'user') {
    return `（系统提示：主动发消息模式触发。距离用户上一条消息已过去 ${minutesPassed} 分钟。请在不打断人设的前提下自然接住对方刚才的话；可以轻描淡写解释回复稍晚，也可以直接顺着话题继续。）`;
  }
  return `（系统提示：主动发消息模式触发。距离你上一条消息已过去 ${minutesPassed} 分钟，用户一直没有回复。请像真人间隔一阵后自然续聊：可以补一句、换个轻话题，或分享当下状态/见闻；不要写成系统通知或任务播报。）`;
}

function fallbackMessage(contactName, lastMessage, minutesPassed) {
  if (lastMessage && lastMessage.role === 'user') {
    return `刚刚在忙，现在看到啦。${contactName ? `${contactName}想接着聊聊，` : ''}我在想你刚才那句。`;
  }
  return `${contactName || '对方'}隔了一会儿又来找你：我突然想到一件事，想继续和你说。`;
}

async function upsertContact(env, body) {
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO contacts (user_id, contact_id, name, persona_prompt, active_reply_enabled, active_reply_interval_sec, active_reply_start_time, last_triggered_msg_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, contact_id) DO UPDATE SET
      name=excluded.name,
      persona_prompt=excluded.persona_prompt,
      active_reply_enabled=excluded.active_reply_enabled,
      active_reply_interval_sec=excluded.active_reply_interval_sec,
      active_reply_start_time=excluded.active_reply_start_time,
      last_triggered_msg_id=excluded.last_triggered_msg_id,
      updated_at=excluded.updated_at
  `).bind(
    body.userId,
    String(body.contactId),
    body.name || '',
    body.personaPrompt || '',
    body.activeReplyEnabled ? 1 : 0,
    Math.max(1, Math.round(Number(body.activeReplyInterval || 1) * 60)),
    Number(body.activeReplyStartTime || 0),
    body.lastActiveReplyTriggeredMsgId || null,
    now,
    now
  ).run();
}

async function upsertSnapshot(env, body) {
  const now = Date.now();
  const lastMessage = body.lastMessage || {};
  await env.DB.prepare(`
    INSERT INTO message_snapshots (user_id, contact_id, message_id, role, content, type, time, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, contact_id) DO UPDATE SET
      message_id=excluded.message_id,
      role=excluded.role,
      content=excluded.content,
      type=excluded.type,
      time=excluded.time,
      updated_at=excluded.updated_at
  `).bind(
    body.userId,
    String(body.contactId),
    lastMessage.id || null,
    lastMessage.role || 'assistant',
    lastMessage.content || '',
    lastMessage.type || 'text',
    Number(lastMessage.time || now),
    now
  ).run();
}

async function saveSubscription(env, body) {
  const now = Date.now();
  const subscription = body.subscription || {};
  const keys = subscription.keys || {};
  await env.DB.prepare(`
    INSERT INTO device_subscriptions (user_id, device_id, endpoint, p256dh, auth, subscription_json, user_agent, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, device_id) DO UPDATE SET
      endpoint=excluded.endpoint,
      p256dh=excluded.p256dh,
      auth=excluded.auth,
      subscription_json=excluded.subscription_json,
      user_agent=excluded.user_agent,
      updated_at=excluded.updated_at
  `).bind(
    body.userId,
    body.deviceId,
    subscription.endpoint || '',
    keys.p256dh || '',
    keys.auth || '',
    JSON.stringify(subscription),
    body.userAgent || '',
    now,
    now
  ).run();
}

async function getContactConfigs(env, userId) {
  const rows = await env.DB.prepare(`SELECT * FROM contacts WHERE user_id = ?`).bind(userId).all();
  return rows.results || [];
}

async function getMessagesSince(env, userId, since) {
  const rows = await env.DB.prepare(`SELECT * FROM messages WHERE user_id = ? AND time > ? ORDER BY time ASC`).bind(userId, Number(since || 0)).all();
  return rows.results || [];
}

async function markRead(env, body) {
  const ids = Array.isArray(body.messageIds) ? body.messageIds : [];
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  await env.DB.prepare(`UPDATE messages SET read = 1 WHERE user_id = ? AND id IN (${placeholders})`).bind(body.userId, ...ids).run();
}

async function insertMessage(env, message) {
  await env.DB.prepare(`INSERT OR IGNORE INTO messages (id, user_id, contact_id, role, content, type, description, time, read, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      message.id,
      message.userId,
      String(message.contactId),
      message.role || 'assistant',
      message.content || '',
      message.type || 'text',
      message.description || null,
      Number(message.time || Date.now()),
      message.read ? 1 : 0,
      message.source || 'offline-backend'
    ).run();
}

async function updateContactTriggerState(env, userId, contactId, msgId) {
  await env.DB.prepare(`UPDATE contacts SET last_triggered_msg_id = ?, last_triggered_at = ?, last_seen_message_id = ?, updated_at = ? WHERE user_id = ? AND contact_id = ?`)
    .bind(msgId, Date.now(), msgId, Date.now(), userId, String(contactId)).run();
}

async function sendPushToSubscriptions(env, userId, payload) {
  const rows = await env.DB.prepare(`SELECT subscription_json FROM device_subscriptions WHERE user_id = ?`).bind(userId).all();
  const subscriptions = (rows.results || []).map(item => {
    try { return JSON.parse(item.subscription_json); } catch (err) { return null; }
  }).filter(Boolean);
  return { delivered: subscriptions.length, skipped: subscriptions.length === 0, note: 'Cloudflare Worker template stores payload and expects a future web-push sender integration.' , payload };
}

async function triggerForContact(env, contactRow, snapshotRow) {
  const lastMessage = snapshotRow || null;
  if (!lastMessage || !lastMessage.message_id) return null;
  if (contactRow.active_reply_start_time && Number(lastMessage.time || 0) <= Number(contactRow.active_reply_start_time || 0)) return null;
  if (contactRow.last_triggered_msg_id && contactRow.last_triggered_msg_id === lastMessage.message_id) return null;

  const now = Date.now();
  const intervalSec = Math.max(1, Number(contactRow.active_reply_interval_sec || 60));
  if (now - Number(lastMessage.time || 0) < intervalSec * 1000) return null;

  const minutesPassed = Math.max(1, Math.floor((now - Number(lastMessage.time || now)) / 60000));
  const prompt = buildActiveReplyPrompt(lastMessage, minutesPassed);
  const content = fallbackMessage(contactRow.name || '对方', lastMessage, minutesPassed);
  const message = {
    id: `offline-${contactRow.user_id}-${contactRow.contact_id}-${lastMessage.message_id}`,
    userId: contactRow.user_id,
    contactId: contactRow.contact_id,
    role: 'assistant',
    content,
    type: 'text',
    description: prompt,
    time: now,
    read: false,
    source: 'offline-backend'
  };
  await insertMessage(env, message);
  await updateContactTriggerState(env, contactRow.user_id, contactRow.contact_id, lastMessage.message_id);
  await sendPushToSubscriptions(env, contactRow.user_id, {
    title: contactRow.name || '新消息',
    body: content,
    tag: `contact-${contactRow.contact_id}`,
    contactId: contactRow.contact_id,
    url: `${env.APP_ORIGIN || ''}/?contactId=${encodeURIComponent(contactRow.contact_id)}&openChat=1`
  });
  return message;
}

async function runCron(env) {
  const rows = await env.DB.prepare(`
    SELECT c.*, s.message_id, s.role, s.content, s.type, s.time
    FROM contacts c
    LEFT JOIN message_snapshots s ON s.user_id = c.user_id AND s.contact_id = c.contact_id
    WHERE c.active_reply_enabled = 1
  `).all();
  const results = rows.results || [];
  let triggered = 0;
  for (const row of results) {
    const snapshot = row.message_id ? {
      message_id: row.message_id,
      role: row.role,
      content: row.content,
      type: row.type,
      time: row.time
    } : null;
    const inserted = await triggerForContact(env, row, snapshot);
    if (inserted) triggered += 1;
  }
  return triggered;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return json({ ok: true });
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/api/push/subscribe') {
      const body = await readJson(request);
      await saveSubscription(env, body);
      return json({ ok: true });
    }

    if (request.method === 'POST' && url.pathname === '/api/contacts') {
      const body = await readJson(request);
      await upsertContact(env, body);
      return json({ ok: true });
    }

    if (request.method === 'GET' && url.pathname === '/api/contacts/active-reply-config') {
      const userId = url.searchParams.get('userId') || 'default-user';
      const contacts = await getContactConfigs(env, userId);
      return json({ contacts, serverTime: Date.now() });
    }

    if (request.method === 'POST' && url.pathname === '/api/messages/snapshot') {
      const body = await readJson(request);
      await upsertSnapshot(env, body);
      return json({ ok: true });
    }

    if (request.method === 'POST' && url.pathname === '/api/messages/sync') {
      const body = await readJson(request);
      const messages = await getMessagesSince(env, body.userId || 'default-user', body.since || 0);
      return json({ messages, serverTime: Date.now() });
    }

    if (request.method === 'POST' && url.pathname === '/api/messages/mark-read') {
      const body = await readJson(request);
      await markRead(env, body);
      return json({ ok: true });
    }

    if (request.method === 'POST' && url.pathname === '/api/debug/trigger-active-reply') {
      const body = await readJson(request);
      const contactRows = await env.DB.prepare(`
        SELECT c.*, s.message_id, s.role, s.content, s.type, s.time
        FROM contacts c
        LEFT JOIN message_snapshots s ON s.user_id = c.user_id AND s.contact_id = c.contact_id
        WHERE c.user_id = ? AND c.contact_id = ?
      `).bind(body.userId || 'default-user', String(body.contactId)).all();
      const row = (contactRows.results || [])[0];
      if (!row) return json({ ok: false, error: 'contact not found' }, 404);
      const message = await triggerForContact(env, row, row.message_id ? row : null);
      return json({ ok: true, message, serverTime: Date.now() });
    }

    return json({ ok: false, error: 'not found' }, 404);
  },

  async scheduled(controller, env) {
    await runCron(env);
  }
};
