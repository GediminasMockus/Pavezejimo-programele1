import { createClient } from '@supabase/supabase-js';

const HOURS_OLD = 1;
const REMINDER_COOLDOWN_HOURS = 24;
const APP_URL = process.env.APP_URL || 'https://pavezejimo-programele1.vercel.app';

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
  const brevoApiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.BREVO_FROM_EMAIL;

  if (!supabaseUrl || !serviceRoleKey || !brevoApiKey || !fromEmail) {
    return res.status(500).json({
      error: 'Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY, BREVO_FROM_EMAIL',
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = Date.now();
  const oldEnough = new Date(now - HOURS_OLD * 60 * 60 * 1000).toISOString();
  const cooldownCutoff = new Date(now - REMINDER_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();

  const { data: notifications, error: notificationsError } = await supabase
    .from('notifications')
    .select('id, user_id')
    .eq('read', false)
    .lte('created_at', oldEnough)
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

  for (const userId of notificationIdsByUser.keys()) {
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
      .lte('created_at', oldEnough);

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
      : unreadCount >= 2 && unreadCount <= 4
        ? `Turite ${unreadCount} neperskaitytus pranešimus`
        : `Turite ${unreadCount} neperskaitytų pranešimų`;
    const html = `<!doctype html><html lang="lt"><body style="font-family:Arial,sans-serif;color:#222;line-height:1.6">
      <h2>Jūsų laukia pranešimas</h2>
      <p>Sveiki! Pavežėjimo programėlėje turite <strong>${unreadCount}</strong> neperskaitytų pranešimų.</p>
      <p>Prisijunkite ir peržiūrėkite pranešimus, kad nepraleistumėte kelionės užklausos ar atsakymo.</p>
      <p><a href="${APP_URL}" style="display:inline-block;padding:12px 18px;background:#166534;color:#fff;text-decoration:none;border-radius:8px">Peržiūrėti pranešimus</a></p>
      <p style="font-size:12px;color:#666">Šį priminimą siunčiame, nes jūsų paskyroje vis dar yra neperskaitytų pranešimų. Jei juos jau peržiūrėjote, šį laišką galite ignoruoti.</p>
    </body></html>`;

    let emailResponse;
    try {
      const senderMatch = fromEmail.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
      const sender = senderMatch
        ? { name: senderMatch[1].replace(/^['\"]|['\"]$/g, '') || 'Pavežėjimo programėlė', email: senderMatch[2].trim() }
        : { name: 'Pavežėjimo programėlė', email: fromEmail.trim() };
      emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': brevoApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender,
          to: [{ email }],
          subject,
          htmlContent: html,
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
