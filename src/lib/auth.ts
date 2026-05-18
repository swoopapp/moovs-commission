import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

const DEFAULT_ALLOWED_DOMAINS = ['moovsapp.com', 'swoopapp.com'];

function allowedDomains(): string[] {
  return (process.env.ADMIN_ALLOWED_DOMAINS || DEFAULT_ALLOWED_DOMAINS.join(','))
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    signIn({ profile }) {
      const email = profile?.email?.toLowerCase();
      if (!email) return false;
      const domain = email.split('@')[1];
      return allowedDomains().includes(domain);
    },
    jwt({ token, profile }) {
      if (profile) {
        token.email = profile.email;
        token.name = profile.name;
        token.picture = profile.picture;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.image = token.picture as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/sign-in',
    error: '/auth/error',
  },
});
