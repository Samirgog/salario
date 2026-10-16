import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? 'http://localhost:5173',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const encoder = new TextEncoder();

async function hmac(keyBytes: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, encoder.encode(message));
}

function hex(value: ArrayBuffer) { return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, '0')).join(''); }
function base64url(value: Uint8Array | string) { const bytes = typeof value === 'string' ? encoder.encode(value) : value; let binary = ''; bytes.forEach((byte) => { binary += String.fromCharCode(byte); }); return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

async function signJwt(userId: string) {
  const jwtSecret = Deno.env.get('PROJECT_JWT_SECRET');
  if (!jwtSecret) throw new Error('PROJECT_JWT_SECRET is not configured');
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ aud: 'authenticated', exp: now + 3600, iat: now, iss: 'supabase', role: 'authenticated', sub: userId }));
  const unsigned = `${header}.${payload}`;
  const signature = new Uint8Array(await hmac(encoder.encode(jwtSecret).buffer as ArrayBuffer, unsigned));
  return `${unsigned}.${base64url(signature)}`;
}

type TelegramUser = { id?: number; first_name?: string; last_name?: string; username?: string; photo_url?: string; language_code?: string };

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { initDataRaw } = await request.json() as { initDataRaw?: string };
    if (!initDataRaw) return response({ error: 'initDataRaw is required' }, 400);
    const params = new URLSearchParams(initDataRaw);
    const receivedHash = params.get('hash');
    const authDate = Number(params.get('auth_date'));
    if (!receivedHash || !authDate || Date.now() / 1000 - authDate > 86400) return response({ error: 'Invalid or expired initData' }, 401);
    // For the bot-token validation, Telegram excludes only `hash` from the data-check string.
    // `signature` is a separate field and must remain if Telegram included it in initData.
    params.delete('hash');
    const dataCheckString = [...params.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join('\n');
    const botToken = Deno.env.get('BOT_TOKEN');
    if (!botToken) return response({ error: 'BOT_TOKEN is not configured' }, 500);
    const secretKey = await hmac(encoder.encode('WebAppData').buffer as ArrayBuffer, botToken);
    if (hex(await hmac(secretKey, dataCheckString)) !== receivedHash) return response({ error: 'Telegram signature mismatch' }, 401);
    const telegramUser = JSON.parse(params.get('user') ?? '{}') as TelegramUser;
    if (!telegramUser.id || !telegramUser.first_name) return response({ error: 'Telegram user is missing' }, 400);

    const adminKey = Deno.env.get('ADMIN_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!adminKey) return response({ error: 'ADMIN_SERVICE_ROLE_KEY is not configured' }, 500);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, adminKey);
    const email = `telegram-${telegramUser.id}@salario.invalid`;
    const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (users.error) return response({ error: users.error.message }, 500);
    let authUser = users.data.users.find((user) => user.email === email);
    const oldProfile = await admin.from('profiles').select('id').eq('telegram_id', telegramUser.id).maybeSingle();
    if (!authUser) {
      const created = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { telegram_id: telegramUser.id, first_name: telegramUser.first_name } });
      if (created.error || !created.data.user) return response({ error: created.error?.message ?? 'Could not create Auth user' }, 500);
      authUser = created.data.user;
    }
    if (oldProfile.data && oldProfile.data.id !== authUser.id) {
      const members = await admin.from('household_members').select('household_id').eq('user_id', oldProfile.data.id).limit(1);
      if ((members.data ?? []).length > 0) return response({ error: 'Legacy profile is linked to a household; contact support' }, 409);
      await admin.from('profiles').delete().eq('id', oldProfile.data.id);
    }
    const { data: profile, error: profileError } = await admin.from('profiles').upsert({ id: authUser.id, telegram_id: telegramUser.id, first_name: telegramUser.first_name, last_name: telegramUser.last_name ?? null, username: telegramUser.username ?? null, photo_url: telegramUser.photo_url ?? null, language_code: telegramUser.language_code ?? null, timezone: 'UTC' }, { onConflict: 'telegram_id' }).select('id').single();
    if (profileError || !profile) return response({ error: profileError?.message ?? 'Could not create profile' }, 500);
    return response({ userId: profile.id, accessToken: await signJwt(profile.id) });
  } catch (error) { return response({ error: error instanceof Error ? error.message : 'Authentication failed' }, 400); }
});
