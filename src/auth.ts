import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const allowedDomain = process.env.AUTH_ALLOWED_DOMAIN?.toLowerCase().trim();
const allowedEmails = process.env.AUTH_ALLOWED_EMAILS?.split(",")
  .map((e) => e.toLowerCase().trim())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    signIn({ profile }) {
      const email = profile?.email?.toLowerCase();
      if (!email) return false;
      if (allowedEmails?.length && allowedEmails.includes(email)) return true;
      if (allowedDomain && email.endsWith(`@${allowedDomain}`)) return true;
      if (!allowedEmails?.length && !allowedDomain) return true;
      return false;
    },
  },
});
