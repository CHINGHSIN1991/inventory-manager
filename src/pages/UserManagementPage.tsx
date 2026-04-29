import { createResource, createSignal, For, Show } from "solid-js";
import { Navigate } from "@solidjs/router";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import type { Profile, UserRole } from "../lib/database.types";
import { css } from "../../styled-system/css";

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "管理員",
  warehouse: "倉管",
  viewer: "檢視者",
  partner: "合作廠商",
};

async function fetchNonAdminUsers(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .neq("role", "admin")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export function UserManagementPage() {
  const { profile, session } = useAuth();
  const isAdmin = () => profile()?.role === "admin";

  const [users, { refetch }] = createResource(isAdmin, (ok) =>
    ok ? fetchNonAdminUsers() : Promise.resolve([] as Profile[])
  );

  const [saving, setSaving] = createSignal<string | null>(null); // userId being saved
  const [error, setError] = createSignal("");

  // ── change role ──────────────────────────────────────────────────────────
  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    setSaving(userId);
    setError("");
    const { error: err } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", userId);
    if (err) setError(`角色更新失敗：${err.message}`);
    else refetch();
    setSaving(null);
  };

  // ── toggle is_active ─────────────────────────────────────────────────────
  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    setSaving(userId);
    setError("");
    const { error: err } = await supabase
      .from("profiles")
      .update({ is_active: !currentActive })
      .eq("id", userId);
    if (err) setError(`狀態更新失敗：${err.message}`);
    else refetch();
    setSaving(null);
  };

  // ── delete user ──────────────────────────────────────────────────────────
  const handleDelete = async (userId: string, displayName: string | null, email: string) => {
    const label = displayName ?? email;
    if (!confirm(`確定要刪除帳號「${label}」？此操作無法還原。`)) return;

    setSaving(userId);
    setError("");

    const rawUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const supabaseUrl =
      rawUrl.startsWith("http") || rawUrl.includes(".")
        ? rawUrl
        : `https://${rawUrl}.supabase.co`;
    const token = session()?.access_token;

    const res = await fetch(`${supabaseUrl}/functions/v1/admin-manage-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action: "delete", userId }),
    });

    const json = await res.json() as { success?: boolean; error?: string };
    if (!res.ok || json.error) {
      setError(json.error ?? "刪除失敗");
    } else {
      refetch();
    }
    setSaving(null);
  };

  // Admin guard
  if (!isAdmin()) {
    return <Navigate href="/" />;
  }

  return (
    <div>
      <h1 class={pageTitle}>帳號管理</h1>

      <Show when={error()}>
        <div class={errorBox}>{error()}</div>
      </Show>

      <Show when={users.loading}>
        <p class={loadingText}>載入中...</p>
      </Show>

      <Show when={!users.loading}>
        <Show
          when={(users() ?? []).length > 0}
          fallback={<p class={emptyText}>目前沒有其他帳號</p>}
        >
          <div class={tableWrapper}>
            <table class={table}>
              <thead>
                <tr>
                  <th class={th}>名稱</th>
                  <th class={th}>Email</th>
                  <th class={th}>角色</th>
                  <th class={th}>狀態</th>
                  <th class={th}>建立時間</th>
                  <th class={th}>操作</th>
                </tr>
              </thead>
              <tbody>
                <For each={users()}>
                  {(u) => (
                    <tr class={tr}>
                      <td class={td}>{u.display_name ?? "—"}</td>
                      <td class={td}>{u.email}</td>
                      <td class={td}>
                        <select
                          class={roleSelect}
                          value={u.role}
                          disabled={saving() === u.id}
                          onChange={(e) =>
                            handleRoleChange(u.id, e.currentTarget.value as UserRole)
                          }
                        >
                          <For each={Object.entries(ROLE_LABELS) as [UserRole, string][]}>
                            {([val, label]) => (
                              <option value={val}>{label}</option>
                            )}
                          </For>
                        </select>
                      </td>
                      <td class={td}>
                        <button
                          class={css({
                            px: "2",
                            py: "0.5",
                            borderRadius: "full",
                            fontSize: "xs",
                            fontWeight: "medium",
                            cursor: "pointer",
                            border: "1px solid",
                            bg: u.is_active ? "green.100" : "gray.100",
                            color: u.is_active ? "green.800" : "gray.600",
                            borderColor: u.is_active ? "green.300" : "gray.300",
                            _hover: { opacity: "0.8" },
                            _disabled: { opacity: "0.5", cursor: "not-allowed" },
                          })}
                          disabled={saving() === u.id}
                          onClick={() => handleToggleActive(u.id, u.is_active)}
                        >
                          {u.is_active ? "啟用" : "停用"}
                        </button>
                      </td>
                      <td class={td}>
                        {new Date(u.created_at).toLocaleDateString("zh-TW")}
                      </td>
                      <td class={td}>
                        <button
                          class={deleteBtn}
                          disabled={saving() === u.id}
                          onClick={() => handleDelete(u.id, u.display_name, u.email)}
                        >
                          {saving() === u.id ? "處理中..." : "刪除"}
                        </button>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </Show>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const pageTitle = css({
  fontSize: "xl",
  fontWeight: "bold",
  color: "gray.900",
  mb: "6",
});

const errorBox = css({
  mb: "4",
  p: "3",
  bg: "red.50",
  border: "1px solid",
  borderColor: "red.200",
  borderRadius: "md",
  color: "red.700",
  fontSize: "sm",
});

const loadingText = css({ color: "gray.500", py: "8", textAlign: "center" });
const emptyText = css({ color: "gray.400", py: "8", textAlign: "center" });

const tableWrapper = css({ overflowX: "auto", borderRadius: "lg", shadow: "sm" });

const table = css({
  w: "100%",
  borderCollapse: "collapse",
  bg: "white",
  borderRadius: "lg",
  overflow: "hidden",
  fontSize: "sm",
});

const th = css({
  px: "4",
  py: "3",
  bg: "gray.50",
  textAlign: "left",
  fontSize: "xs",
  fontWeight: "semibold",
  color: "gray.500",
  textTransform: "uppercase",
  borderBottom: "1px solid",
  borderColor: "gray.200",
});

const tr = css({
  borderBottom: "1px solid",
  borderColor: "gray.100",
  _hover: { bg: "gray.50" },
});

const td = css({ px: "4", py: "3", color: "gray.700" });

const roleSelect = css({
  px: "2",
  py: "1",
  border: "1px solid",
  borderColor: "gray.300",
  borderRadius: "md",
  fontSize: "sm",
  bg: "white",
  cursor: "pointer",
  outline: "none",
  _focus: { borderColor: "blue.500" },
  _disabled: { opacity: "0.5", cursor: "not-allowed" },
});

const deleteBtn = css({
  px: "3",
  py: "1",
  bg: "transparent",
  color: "red.600",
  border: "1px solid",
  borderColor: "red.300",
  borderRadius: "md",
  fontSize: "sm",
  cursor: "pointer",
  _hover: { bg: "red.50" },
  _disabled: { opacity: "0.5", cursor: "not-allowed" },
});
