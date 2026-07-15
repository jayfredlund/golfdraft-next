import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { NextPage } from 'next';
import { createClient } from '../lib/supabase/component';

const AuthPage: NextPage = () => {
  const redirectTo =
    typeof window !== 'undefined' ? `${window.location.origin}/api/auth/confirm?next=/` : undefined;

  return (
    <div className="container">
      <Auth
        supabaseClient={createClient()}
        magicLink
        redirectTo={redirectTo}
        view="magic_link"
        providers={[]}
        appearance={{ theme: ThemeSupa }}
      />
    </div>
  );
};

export default AuthPage;
