import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import {
  accounts,
  expenseCategories,
  memberships,
  projects,
  sessions,
  users,
  verificationTokens,
} from "@/db/schema";
import { seedProjectBoards } from "@/lib/kanban/seed";
import { hasVerifiedOAuthEmail } from "@/lib/auth-email";
import { parseUserPrefs } from "@/lib/validation/prefs";

const DEFAULT_CATEGORIES: Array<{ name: string; emoji: string; color: string }> = [
  { name: "Food", emoji: "🍔", color: "#f59e0b" },
  { name: "Transport", emoji: "🚌", color: "#3b82f6" },
  { name: "Bills", emoji: "🧾", color: "#64748b" },
  { name: "Shopping", emoji: "🛍️", color: "#ec4899" },
  { name: "Health", emoji: "💊", color: "#10b981" },
  { name: "Fun", emoji: "🎉", color: "#8b5cf6" },
  { name: "Other", emoji: "📦", color: "#14b8a6" },
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  trustHost: true,
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  pages: {
    signIn: "/signin",
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID,
      clientSecret:
        process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID ?? process.env.GITHUB_CLIENT_ID,
      clientSecret:
        process.env.AUTH_GITHUB_SECRET ?? process.env.GITHUB_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
      userinfo: {
        url: "https://api.github.com/user",
        async request({ tokens }: { tokens: { access_token?: string } }) {
          const headers = {
            Authorization: `Bearer ${tokens.access_token}`,
            "User-Agent": "wrangle",
          };
          const profile = (await fetch("https://api.github.com/user", {
            headers,
          }).then((response) => response.json())) as Record<string, unknown>;
          const emailsResponse = await fetch("https://api.github.com/user/emails", {
            headers,
          });
          if (!emailsResponse.ok) {
            profile.email = null;
            profile.email_verified = false;
            return profile;
          }

          const emails = (await emailsResponse.json()) as Array<{
            email: string;
            primary: boolean;
            verified: boolean;
          }>;
          const verified =
            emails.find((email) => email.primary && email.verified) ??
            emails.find((email) => email.verified);
          profile.email = verified?.email ?? null;
          profile.email_verified = Boolean(verified);
          return profile;
        },
      },
    }),
  ],
  callbacks: {
    signIn({ account, profile }) {
      return hasVerifiedOAuthEmail(account?.provider, profile);
    },
    session({ session, user }) {
      session.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        emailVerified: user.emailVerified,
        timezone: user.timezone,
        theme: user.theme,
        aiMode: parseUserPrefs(user.prefs).ai?.mode ?? "off",
      };
      return session;
    },
  },
  events: {
    createUser: async (event) => {
      const user = event.user as typeof users.$inferSelect;
      if (!user.id) return;
      await db.transaction(async (tx) => {
        const [project] = await tx
          .insert(projects)
          .values({
            name: "My Space",
            emoji: "🏠",
            ownerId: user.id,
            isPersonal: true,
          })
          .returning();
        await tx.insert(memberships).values({
          projectId: project.id,
          userId: user.id,
          role: "owner",
        });
        await seedProjectBoards(tx, project.id);
        await tx.insert(expenseCategories).values(
          DEFAULT_CATEGORIES.map((c, i) => ({
            userId: user.id,
            name: c.name,
            emoji: c.emoji,
            color: c.color,
            position: `a${i}`,
          })),
        );
      });
    },
  },
});
