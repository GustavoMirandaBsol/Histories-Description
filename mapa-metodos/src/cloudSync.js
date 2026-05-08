import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const cloudSyncEnabled = Boolean(supabaseUrl && supabaseAnonKey);

const supabase = cloudSyncEnabled ? createClient(supabaseUrl, supabaseAnonKey) : null;

export async function loadSharedProject(projectId) {
  if (!supabase || !projectId) return null;

  const { data, error } = await supabase
    .from("project_states")
    .select("payload")
    .eq("id", projectId)
    .maybeSingle();

  if (error) throw error;
  return data?.payload ?? null;
}

export async function saveSharedProject(project) {
  if (!supabase || !project?.id) return;

  const { error } = await supabase.from("project_states").upsert({
    id: project.id,
    payload: project,
    updated_at: new Date().toISOString()
  });

  if (error) throw error;
}

export function subscribeToSharedProject(projectId, onProjectUpdate, onError) {
  if (!supabase || !projectId) return () => {};

  const channel = supabase
    .channel(`project_states:${projectId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "project_states",
        filter: `id=eq.${projectId}`
      },
      (event) => {
        if (event.new?.payload) {
          onProjectUpdate(event.new.payload);
        }
      }
    )
    .subscribe((status, error) => {
      if (error) onError?.(error);
      if (status === "CHANNEL_ERROR") onError?.(new Error("No se pudo abrir el canal realtime."));
    });

  return () => {
    supabase.removeChannel(channel);
  };
}
