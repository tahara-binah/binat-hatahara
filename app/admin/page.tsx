import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import {
  listConfigVersions,
  loadDraftConfig,
  type ConfigVersionSummary,
  type DraftConfigResult,
} from "@/lib/config/repository";
import { DEFAULT_APP_CONFIG } from "@/lib/config/defaults";
import { getCurrentAdmin } from "@/lib/supabase/admin";

export default async function AdminPage() {
  const admin = await getCurrentAdmin();

  if (!admin.supabase) {
    return (
      <AdminShell>
        <SetupNotice message="Supabase is not configured. Add the environment variables from .env.example before using the admin panel." />
      </AdminShell>
    );
  }

  if (!admin.user) {
    redirect("/admin/login");
  }

  let draft: DraftConfigResult = {
    config: DEFAULT_APP_CONFIG,
    updatedAt: null,
    source: "bundled-default",
  };
  let versions: ConfigVersionSummary[] = [];
  let setupError: string | null = null;

  try {
    draft = await loadDraftConfig(admin.supabase);
    versions = await listConfigVersions(admin.supabase);
  } catch (error) {
    setupError =
      error instanceof Error
        ? error.message
        : "Unable to load admin data. Check the Supabase migration and tahara_admin_users row.";
  }

  return (
    <AdminShell>
      {setupError ? (
        <SetupNotice message={setupError} />
      ) : (
        <AdminDashboard
          initialDraft={draft}
          initialVersions={versions}
          userEmail={admin.user.email || "admin"}
        />
      )}
    </AdminShell>
  );
}

function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen px-4 py-6 sm:px-6">
      <div className="mx-auto w-full max-w-7xl">{children}</div>
    </main>
  );
}

function SetupNotice({ message }: { message: string }) {
  return (
    <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 shadow-soft">
      <p className="text-sm font-bold uppercase tracking-wide text-amber-700">Setup needed</p>
      <h1 className="mt-2 text-3xl font-bold text-amber-950">Admin panel is waiting on Supabase</h1>
      <p className="mt-4 max-w-3xl text-sm leading-6 text-amber-900">{message}</p>
      <pre className="mt-5 overflow-auto rounded-2xl bg-amber-950 p-4 text-xs leading-6 text-amber-50">
{`insert into public.tahara_admin_users (email, is_owner)
values ('you@example.com', true)
on conflict (email) do update set is_owner = true;`}
      </pre>
    </div>
  );
}
