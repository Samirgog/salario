import { supabase, supabaseAnonKey, supabaseUrl } from './supabase';

declare global { interface Window { Telegram?: { WebApp?: { initData?: string; ready?: () => void; expand?: () => void } } } }

export async function authenticateTelegram(): Promise<{ userId: string; inviteCode?: string }> {
  if (!supabase || !supabaseUrl) throw new Error('Supabase не настроен: проверьте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY.');
  const initDataRaw = window.Telegram?.WebApp?.initData;
  if (!initDataRaw) throw new Error('Откройте приложение из Telegram Mini App: Telegram initData отсутствует.');
  window.Telegram?.WebApp?.ready?.(); window.Telegram?.WebApp?.expand?.();
  const response = await fetch(`${supabaseUrl}/functions/v1/auth-telegram`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(supabaseAnonKey ? { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` } : {}) }, body: JSON.stringify({ initDataRaw }) });
  const payload = await response.json() as { accessToken?: string; userId?: string; error?: string };
  if (!response.ok || !payload.accessToken || !payload.userId) throw new Error(payload.error ?? 'Telegram авторизация не выполнена.');
  const { error } = await supabase.auth.setSession({ access_token: payload.accessToken, refresh_token: payload.accessToken });
  if (error) throw error;
  const startParam = new URLSearchParams(initDataRaw).get('start_param') ?? new URLSearchParams(window.location.search).get('tgWebAppStartParam');
  return { userId: payload.userId, inviteCode: startParam?.replace(/^invite_/, '') || undefined };
}
