import { loadActiveConfig } from "@/lib/config/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BinatApp } from "@/components/public/BinatApp";
import { redirect } from "next/navigation";

type HomeProps = {
  searchParams?: Promise<{
    code?: string;
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  if (params?.code) {
    redirect(`/auth/callback?code=${encodeURIComponent(params.code)}&next=/admin`);
  }

  const supabase = await createSupabaseServerClient();
  const activeConfig = await loadActiveConfig(supabase);

  return <BinatApp initialConfig={activeConfig} />;
}
