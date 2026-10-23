import { createClient } from '@supabase/supabase-js';

const HOURS_OLD = 24;
const REMINDER_COOLDOWN_DAYS = 7;
const APP_URL = process.env.APP_URL || 'https://pavezejimo-programele1.vercel.app';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  const authorization = req.headers.authorization;
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !fromEmail) {
    return res.status(500).json({
      error: 'Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, RESEND_FROM_EMAIL',
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = Date.now();
  const oldEnough = new Date(now - HOURS_OLD * 60 * 60 * 1000).toISOString();
  const notTooOld = new Date(now - 48 * 60 * 60 * 1000).toISOString();
  const cooldownCutoff = new Date(now - REMINDER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: notifications, error: notificationsError } = await supabase
    .from('notifications')
    .select('id, user_id')
    .eq('read', false)
    .lte('created_at', oldEnough)
    .gte('created_at', notTooOld)
    .limit(5000);

  if (notificationsError) {
    console.error('Unable to load unread notifications:', notificationsError.message);
    return res.status(500).json({ error: 'Unable to load unread notifications' });
  }

  const notificationIdsByUser = new Map();
  for (const notification of notifications || []) {
    if (!notification.user_id) continue;
    const ids = notificationIdsByUser.get(notification.user_id) || [];
    ids.push(notification.id);
    notificationIdsByUser.set(notification.user_id, ids);
  }

  let sent = 0;
  let skipped = 0;
  const errors = [];

  for (const [userId, notificationIds] of notificationIdsByUser) {
    const { data: previousReminder, error: reminderLookupError } = await supabase
      .from('notification_email_reminders')
      .select('last_sent_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (reminderLookupError) {
      errors.push({ userId, reason: 'reminder lookup failed' });
      continue;
    }

    if (previousReminder?.last_sent_at && previousReminder.last_sent_at > cooldownCutoff) {
      skipped++;
      continue;
    }

    // Recheck immediately before sending so notifications read after the initial query do not trigger email.
    const { count: unreadCount, error: unreadCountError } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false)
      .lte('created_at', oldEnough)
      .gte('created_at', notTooOld);

    if (unreadCountError || !unreadCount) {
      if (unreadCountError) errors.push({ userId, reason: 'unread count failed' });
      else skipped++;
      continue;
    }

    const { data: authData, error: userError } = await supabase.auth.admin.getUserById(userId);
    const email = authData?.user?.email;
    if (userError || !email) {
      errors.push({ userId, reason: 'email unavailable' });
      continue;
    }

    const subject = unreadCount === 1
      ? 'Turite neperskaitytą pranešimą'
      : `Turite ${unreadCount} neperskaitytus pranešimus`;
    const html = `<!doctype html><html lang="lt"><body style="font-family:Arial,sans-serif;color:#222;line-height:1.6">
      <h2>Jūsų laukia pranešimas</h2>
      <p>Sveiki! Pavežėjimo programėlėje turite <strong>${unreadCount}</strong> neperskaitytų pranešimų.</p>
      <p>Prisijunkite ir peržiūrėkite pranešimus, kad nepraleistumėte kelionės užklausos ar atsakymo.</p>
      <p><a href="${APP_URL}" style="display:inline-block;padding:12px 18px;background:#166534;color:#fff;text-decoration:none;border-radius:8px">Peržiūrėti pranešimus</a></p>
      <p style="font-size:12px;color:#666">Šis priminimas siunčiamas, nes jūsų paskyroje liko neperskaitytų pranešimų.</p>
    </body></html>`;

    let emailResponse;
    try {
      emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [email],
          subject,
          html,
        }),
      });
    } catch {
      errors.push({ userId, reason: 'email provider request failed' });
      continue;
    }

    if (!emailResponse.ok) {
      const details = await emailResponse.text().catch(() => '');
      console.error('Email provider rejected reminder:', emailResponse.status, details.slice(0, 300));
      errors.push({ userId, reason: `email provider returned ${emailResponse.status}` });
      continue;
    }

    const { error: saveError } = await supabase
      .from('notification_email_reminders')
      .upsert({ user_id: userId, last_sent_at: new Date().toISOString() }, { onConflict: 'user_id' });

    if (saveError) {
      // Email has already been sent; log the persistence issue for follow-up.
      console.error('Reminder sent but cooldown could not be saved:', saveError.message);
      errors.push({ userId, reason: 'reminder sent but cooldown save failed' });
    }
    sent++;
  }

  return res.status(errors.length ? 207 : 200).json({
    checkedUsers: notificationIdsByUser.size,
    sent,
    skipped,
    errors,
  });
}
