import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { User } from "next-auth";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

export type UserRole = "admin" | "readonly";

const ADMIN_USERNAME = process.env.AUTH_ADMIN_USERNAME?.trim();
const ADMIN_PASSWORD_HASH = process.env.AUTH_ADMIN_PASSWORD_HASH?.trim();
const READONLY_USERNAME = process.env.AUTH_READONLY_USERNAME?.trim();
const READONLY_PASSWORD_HASH = process.env.AUTH_READONLY_PASSWORD_HASH?.trim();

function hashPassword(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 64);
}

function parseStoredPasswordHash(value: string): { salt: Buffer; hash: Buffer } | null {
  const [saltHex, hashHex] = value.split(":");
  if (!saltHex || !hashHex) return null;

  try {
    return {
      salt: Buffer.from(saltHex, "hex"),
      hash: Buffer.from(hashHex, "hex"),
    };
  } catch {
    return null;
  }
}

function verifyPassword(password: string, storedValue: string): boolean {
  const parsed = parseStoredPasswordHash(storedValue);
  if (!parsed) return false;

  const candidateHash = hashPassword(password, parsed.salt);
  if (candidateHash.length !== parsed.hash.length) return false;

  return timingSafeEqual(candidateHash, parsed.hash);
}

export function createPasswordHash(password: string): string {
  const salt = randomBytes(16);
  const hash = hashPassword(password, salt);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

function authorizeUser(username: string, password: string): User | null {
  if (ADMIN_USERNAME && ADMIN_PASSWORD_HASH && username === ADMIN_USERNAME) {
    if (!verifyPassword(password, ADMIN_PASSWORD_HASH)) return null;
    return {
      id: "admin",
      name: ADMIN_USERNAME,
      email: ADMIN_USERNAME,
      role: "admin",
    };
  }

  if (READONLY_USERNAME && READONLY_PASSWORD_HASH && username === READONLY_USERNAME) {
    if (!verifyPassword(password, READONLY_PASSWORD_HASH)) return null;
    return {
      id: "readonly",
      name: READONLY_USERNAME,
      email: READONLY_USERNAME,
      role: "readonly",
    };
  }

  return null;
}

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";

function withBasePath(url: string, baseUrl: string): string {
  if (!BASE_PATH) return url;

  if (url.startsWith("/")) {
    if (url === BASE_PATH || url.startsWith(`${BASE_PATH}/`)) {
      return `${baseUrl}${url}`;
    }
    return `${baseUrl}${BASE_PATH}${url}`;
  }

  if (url.startsWith(baseUrl)) {
    const rest = url.slice(baseUrl.length) || "/";
    if (rest === BASE_PATH || rest.startsWith(`${BASE_PATH}/`)) return url;
    return `${baseUrl}${BASE_PATH}${rest}`;
  }

  return `${baseUrl}${BASE_PATH}/`;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize(credentials) {
        const username =
          typeof credentials.username === "string" ? credentials.username.trim() : "";
        const password = typeof credentials.password === "string" ? credentials.password : "";

        if (!username || !password) return null;
        return authorizeUser(username, password);
      },
    }),
  ],
  pages: { signIn: `${BASE_PATH}/login` },
  session: { strategy: "jwt" },
  callbacks: {
    redirect({ url, baseUrl }) {
      return withBasePath(url, baseUrl);
    },
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id ?? "admin";
        token.name = user.name ?? ADMIN_USERNAME ?? "Admin";
        token.email = user.email ?? ADMIN_USERNAME ?? "admin";
        token.role = user.role ?? "admin";
      }
      return token;
    },
    session({ session, token }) {
      const role: UserRole = token.role === "readonly" ? "readonly" : "admin";
      session.user = {
        ...session.user,
        name: typeof token.name === "string" ? token.name : (ADMIN_USERNAME ?? "Admin"),
        email: typeof token.email === "string" ? token.email : (ADMIN_USERNAME ?? "admin"),
        role,
      };
      return session;
    },
  },
});

declare module "next-auth" {
  interface User {
    role?: UserRole;
  }

  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: UserRole;
    };
  }
}
