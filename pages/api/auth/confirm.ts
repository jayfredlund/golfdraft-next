import { type EmailOtpType } from '@supabase/supabase-js';
import type { NextApiRequest, NextApiResponse } from 'next';
import createClient from '../../../lib/supabase/api';

function stringOrFirstString(item: string | string[] | undefined) {
  return Array.isArray(item) ? item[0] : item;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).appendHeader('Allow', 'GET').end();
    return;
  }

  const queryParams = req.query;
  const code = stringOrFirstString(queryParams.code);
  const token_hash = stringOrFirstString(queryParams.token_hash);
  const type = stringOrFirstString(queryParams.type);
  const nextParam = stringOrFirstString(queryParams.next);

  let next = nextParam || '/';
  const supabase = createClient(req, res);

  // Supabase may redirect with either a PKCE code or token_hash/type depending on auth settings.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('Failed to exchange auth code for session', error);
      next = '/error';
    }
  } else if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash,
    });
    if (error) {
      console.error('Failed to verify OTP token', error);
      next = '/error';
    }
  } else {
    console.error('Auth callback missing expected query params', { code: !!code, token_hash: !!token_hash, type });
    next = '/error';
  }

  res.redirect(next);
}
