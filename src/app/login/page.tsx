import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import Image from "next/image";
import { withBasePath } from "@/lib/paths";

export const dynamic = "force-dynamic";

function getLoginErrorMessage(error?: string) {
  switch (error) {
    case "CredentialsSignin":
      return "Invalid username or password.";
    case "Configuration":
      return "Authentication is not configured correctly.";
    default:
      return null;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  if (!process.env.AUTH_SECRET) redirect("/");

  const session = await auth();
  if (session?.user) redirect("/");

  const { callbackUrl, error } = await searchParams;
  const errorMessage = getLoginErrorMessage(error);
  const isConfigured = Boolean(
    process.env.AUTH_ADMIN_USERNAME && process.env.AUTH_ADMIN_PASSWORD_HASH,
  );

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-sm mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-blue-400 to-cyan-500" />

        <div className="px-8 pt-8 pb-6 text-center">
          <Image
            src={withBasePath("/logo.png")}
            alt=""
            width={40}
            height={40}
            className="mx-auto mb-4"
            aria-hidden
            unoptimized
          />
          <h1 className="text-xl font-bold text-white mb-1">Cursor Usage Tracker</h1>
          <p className="text-sm text-zinc-400">Sign in to access the dashboard</p>
        </div>

        <div className="px-8 pb-8">
          {!isConfigured && (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              Authentication is enabled, but the admin credentials are missing. Set{" "}
              <code>AUTH_ADMIN_USERNAME</code> and <code>AUTH_ADMIN_PASSWORD_HASH</code> to sign in.
            </div>
          )}
          {errorMessage && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {errorMessage}
            </div>
          )}
          <form
            action={async (formData) => {
              "use server";

              const username = formData.get("username");
              const password = formData.get("password");
              const redirectToValue = formData.get("callbackUrl");
              const redirectTo =
                typeof redirectToValue === "string" && redirectToValue ? redirectToValue : "/";

              try {
                await signIn("credentials", {
                  username: typeof username === "string" ? username : "",
                  password: typeof password === "string" ? password : "",
                  redirectTo,
                });
              } catch (caughtError) {
                if (caughtError instanceof AuthError) {
                  const params = new URLSearchParams();
                  params.set("error", caughtError.type);
                  if (redirectTo !== "/") params.set("callbackUrl", redirectTo);
                  redirect(`/login?${params.toString()}`);
                }
                throw caughtError;
              }
            }}
            className="space-y-4"
          >
            <input type="hidden" name="callbackUrl" value={callbackUrl ?? "/"} />

            <div className="space-y-2">
              <label htmlFor="username" className="block text-sm font-medium text-zinc-300">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-blue-500"
                placeholder="Enter admin username"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-zinc-300">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-blue-500"
                placeholder="Enter password"
              />
            </div>

            <button
              type="submit"
              disabled={!isConfigured}
              className="w-full rounded-xl py-3 px-4 text-sm font-medium text-white bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-50 transition-all cursor-pointer"
            >
              Sign in
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
