import { SubmitForm } from "@/components/submit-form";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * The no-account path for friends who won't sign up. Guarded by a shared token
 * in the URL, and it can only ever add a link, it reads nothing back, so the
 * token leaking exposes no data.
 */
export default async function SubmitPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const provided = Array.isArray(params.token) ? params.token[0] : params.token;
  const expected = env.submitToken();

  if (!expected) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-lg font-semibold">Submissions are closed</h1>
        <p className="mt-2 text-sm text-muted">
          No SUBMIT_TOKEN is configured, so this page is disabled.
        </p>
      </div>
    );
  }

  if (provided !== expected) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-lg font-semibold">Invalid link</h1>
        <p className="mt-2 text-sm text-muted">
          Ask for the current submit link.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-5 py-12">
      <div className="text-center">
        <h1 className="text-lg font-semibold">Send a job link</h1>
        <p className="mt-2 text-sm text-muted">
          Paste any job posting and it gets read, sorted and added to the
          tracker. No account needed.
        </p>
      </div>

      <SubmitForm token={provided} />
    </div>
  );
}
