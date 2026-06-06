import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ADMIN_SECRET = Deno.env.get("ADMIN_SECRET") || "";

type DictionaryEntry = {
  id?: string;
  type?: string;
  value?: string;
  original?: string;
  replacement?: string;
  pronunciations?: string;
  intensity?: number | null;
  language?: string;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return errorResponse("Server is missing Supabase service configuration", 500);
  }

  const userId = request.headers.get("x-app-user-id")?.trim() || "";
  const isAdmin = Boolean(ADMIN_SECRET) && request.headers.get("x-admin-secret") === ADMIN_SECRET;

  if (request.method === "GET") {
    return listEntries(isAdmin);
  }

  if (request.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  if (!userId || userId.length < 12) {
    return errorResponse("Missing app user id", 400);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Expected JSON body", 400);
  }

  const action = String(body.action || "");
  if (action === "create") return createEntry(userId, body.entry as DictionaryEntry);
  if (action === "update") return updateEntry(userId, isAdmin, body.entry as DictionaryEntry);
  if (action === "remove") return disableEntry(userId, isAdmin, String(body.id || ""));
  if (action === "approve") return approveEntry(userId, isAdmin, String(body.id || ""));
  if (action === "disable") return disableEntry(userId, isAdmin, String(body.id || ""));

  return errorResponse("Unknown dictionary action", 400);
});

async function listEntries(includeInactive: boolean) {
  const query = includeInactive
    ? "select=*"
    : "select=*&status=in.(pending_user,approved_global)";
  const response = await dbFetch(`/rest/v1/dictionary_entries?${query}&order=created_at.asc`);
  const entries = await response.json();
  if (!response.ok) return errorResponse("Could not load dictionary", response.status, entries);
  return jsonResponse({ entries });
}

async function createEntry(userId: string, entry: DictionaryEntry) {
  const normalized = safeNormalizeEntry(entry);
  if ("error" in normalized) return errorResponse(normalized.error, 400);
  const duplicate = await findDuplicate(normalized);
  if (duplicate) {
    return jsonResponse({ entry: duplicate, duplicate: true });
  }

  const payload = {
    ...normalized,
    owner_user_id: userId,
    status: "pending_user",
  };
  const response = await dbFetch("/rest/v1/dictionary_entries", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) return errorResponse("Could not create dictionary entry", response.status, result);
  const created = Array.isArray(result) ? result[0] : result;
  await audit("create", userId, false, null, created);
  return jsonResponse({ entry: created });
}

async function updateEntry(userId: string, isAdmin: boolean, entry: DictionaryEntry) {
  const id = String(entry?.id || "");
  if (!id) return errorResponse("Missing entry id", 400);
  const existing = await getEntry(id);
  if (!existing) return errorResponse("Dictionary entry not found", 404);
  if (!canMutate(existing, userId, isAdmin)) return errorResponse("Not allowed to edit this entry", 403);

  const normalized = safeNormalizeEntry(entry);
  if ("error" in normalized) return errorResponse(normalized.error, 400);
  const response = await dbFetch(`/rest/v1/dictionary_entries?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      ...normalized,
      updated_at: new Date().toISOString(),
    }),
  });
  const result = await response.json();
  if (!response.ok) return errorResponse("Could not update dictionary entry", response.status, result);
  const updated = Array.isArray(result) ? result[0] : result;
  await audit("update", userId, isAdmin, existing, updated);
  return jsonResponse({ entry: updated });
}

async function approveEntry(userId: string, isAdmin: boolean, id: string) {
  if (!isAdmin) return errorResponse("Admin secret required", 403);
  const existing = await getEntry(id);
  if (!existing) return errorResponse("Dictionary entry not found", 404);
  const response = await dbFetch(`/rest/v1/dictionary_entries?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      status: "approved_global",
      approved_at: new Date().toISOString(),
      approved_by: userId,
      updated_at: new Date().toISOString(),
    }),
  });
  const result = await response.json();
  if (!response.ok) return errorResponse("Could not approve dictionary entry", response.status, result);
  const updated = Array.isArray(result) ? result[0] : result;
  await audit("approve", userId, true, existing, updated);
  return jsonResponse({ entry: updated });
}

async function disableEntry(userId: string, isAdmin: boolean, id: string) {
  if (!id) return errorResponse("Missing entry id", 400);
  const existing = await getEntry(id);
  if (!existing) return errorResponse("Dictionary entry not found", 404);
  if (!canMutate(existing, userId, isAdmin)) return errorResponse("Not allowed to remove this entry", 403);

  const response = await dbFetch(`/rest/v1/dictionary_entries?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      status: "disabled",
      disabled_at: new Date().toISOString(),
      disabled_by: userId,
      updated_at: new Date().toISOString(),
    }),
  });
  const result = await response.json();
  if (!response.ok) return errorResponse("Could not remove dictionary entry", response.status, result);
  const updated = Array.isArray(result) ? result[0] : result;
  await audit("disable", userId, isAdmin, existing, updated);
  return jsonResponse({ entry: updated });
}

function normalizeEntry(entry: DictionaryEntry = {}) {
  const type = String(entry.type || "").trim();
  if (!["vocabulary", "spelling"].includes(type)) {
    throw new Error("Dictionary entry type must be vocabulary or spelling");
  }

  const normalized = {
    type,
    value: clean(entry.value),
    original: clean(entry.original),
    replacement: clean(entry.replacement),
    pronunciations: clean(entry.pronunciations),
    intensity: Number.isFinite(Number(entry.intensity)) ? Number(entry.intensity) : null,
    language: clean(entry.language),
  };

  if (type === "vocabulary" && !normalized.value) {
    throw new Error("Vocabulary entry requires a value");
  }
  if (type === "spelling" && (!normalized.original || !normalized.replacement)) {
    throw new Error("Spelling entry requires original and replacement");
  }
  return normalized;
}

function safeNormalizeEntry(entry: DictionaryEntry = {}) {
  try {
    return normalizeEntry(entry);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid dictionary entry" };
  }
}

async function findDuplicate(entry: ReturnType<typeof normalizeEntry>) {
  const params = entry.type === "vocabulary"
    ? `type=eq.vocabulary&value=ilike.${encodeURIComponent(entry.value || "")}`
    : `type=eq.spelling&original=ilike.${encodeURIComponent(entry.original || "")}&replacement=ilike.${encodeURIComponent(entry.replacement || "")}`;
  const response = await dbFetch(`/rest/v1/dictionary_entries?select=*&status=in.(pending_user,approved_global)&${params}&limit=1`);
  if (!response.ok) return null;
  const entries = await response.json();
  return Array.isArray(entries) && entries.length > 0 ? entries[0] : null;
}

async function getEntry(id: string) {
  const response = await dbFetch(`/rest/v1/dictionary_entries?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  if (!response.ok) return null;
  const entries = await response.json();
  return Array.isArray(entries) && entries.length > 0 ? entries[0] : null;
}

function canMutate(entry: Record<string, unknown>, userId: string, isAdmin: boolean) {
  if (isAdmin) return true;
  return entry.owner_user_id === userId && entry.status === "pending_user";
}

async function audit(action: string, userId: string, isAdmin: boolean, before: unknown, after: unknown) {
  await dbFetch("/rest/v1/dictionary_audit_log", {
    method: "POST",
    body: JSON.stringify({
      entry_id: (after as { id?: string } | null)?.id || (before as { id?: string } | null)?.id || null,
      action,
      actor_user_id: userId,
      actor_is_admin: isAdmin,
      before_entry: before,
      after_entry: after,
    }),
  });
}

function clean(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function dbFetch(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}
