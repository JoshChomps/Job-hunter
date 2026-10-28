import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (session?.user) redirect("/");

  const params = await searchParams;
  const error = params.error;

  return (
    <div className="mx-auto max-w-sm space-y-5 py-16 text-center">
      <div>
        <h1 className="text-xl font-semibold">Job Hunter</h1>
        <p className="mt-2 text-sm text-muted">
          Private tracker for electrical engineering and AI roles across Canada,
          Singapore and the UK.
        </p>
      </div>

      {error && (
        <p
          className="rounded-md border px-3 py-2 text-sm"
          style={{
            color: "var(--danger)",
            borderColor: "color-mix(in srgb, var(--danger) 40%, transparent)",
          }}
        >
          That account isn&apos;t on the allowlist. Ask the owner to add your
          email address.
        </p>
      )}

      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        <button
          type="submit"
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:opacity-90"
        >
          Continue with Google
        </button>
      </form>

      <p className="text-xs text-muted">
        Sending a link instead? Use the submit page the owner shared with you
        no account needed.
      </p>
    </div>
  );
}
