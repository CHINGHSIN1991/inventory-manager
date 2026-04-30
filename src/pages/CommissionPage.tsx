import { createSignal, createResource, For, Show, createMemo } from "solid-js";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import type {
  Profile,
  Product,
  CollaborationProjectInsert,
  CollaborationProjectProductInsert,
} from "../lib/database.types";
import { css } from "../../styled-system/css";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProjectRow {
  id: string;
  name: string;
  partner_id: string;
  start_date: string;
  end_date: string | null;
  status: "active" | "closed";
  note: string | null;
  created_at: string;
  profiles: { display_name: string | null; email: string } | null;
}

interface ProjProductRow {
  id: string;
  project_id: string;
  product_id: string;
  commission_rate: number;
  products: {
    id: string;
    sku: string;
    name: string;
    unit: string;
    unit_price: number;
  } | null;
}

interface ProjMovementRow {
  id: string;
  product_id: string;
  quantity: number;
}

// ─── Data fetchers ───────────────────────────────────────────────────────────

async function fetchPartners(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "partner")
    .order("display_name");
  if (error) throw error;
  return data ?? [];
}

async function fetchAllProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

async function fetchAllProjects(): Promise<ProjectRow[]> {
  const { data, error } = await supabase
    .from("collaboration_projects")
    .select("*, profiles(display_name, email)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProjectRow[];
}

async function fetchMyProjects(partnerId: string): Promise<ProjectRow[]> {
  const { data, error } = await supabase
    .from("collaboration_projects")
    .select("*, profiles(display_name, email)")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProjectRow[];
}

async function fetchProjectProducts(projectId: string): Promise<ProjProductRow[]> {
  const { data, error } = await supabase
    .from("collaboration_project_products")
    .select("*, products(id, sku, name, unit, unit_price)")
    .eq("project_id", projectId);
  if (error) throw error;
  return (data ?? []) as ProjProductRow[];
}

async function fetchProjectMovements(projectId: string): Promise<ProjMovementRow[]> {
  const { data, error } = await supabase
    .from("stock_movements")
    .select("id, product_id, quantity")
    .eq("project_id", projectId)
    .eq("type", "out");
  if (error) throw error;
  return data ?? [];
}

// ─── Main component ──────────────────────────────────────────────────────────

export function CommissionPage() {
  const { profile, session } = useAuth();

  const isAdmin = () => profile()?.role === "admin";
  const today = new Date().toISOString().slice(0, 10);

  // ── Admin panel mode ────────────────────────────────────────────
  const [panelMode, setPanelMode] = createSignal<"view" | "invite" | "new-project">("view");

  // Invite partner form
  const [inviteEmail, setInviteEmail] = createSignal("");
  const [inviteName, setInviteName] = createSignal("");
  const [inviteError, setInviteError] = createSignal("");
  const [inviteSuccess, setInviteSuccess] = createSignal("");
  const [inviteSubmitting, setInviteSubmitting] = createSignal(false);

  // New project form
  const [newProjName, setNewProjName] = createSignal("");
  const [newProjPartnerId, setNewProjPartnerId] = createSignal("");
  const [newProjStartDate, setNewProjStartDate] = createSignal(today);
  const [newProjEndDate, setNewProjEndDate] = createSignal("");
  const [newProjNote, setNewProjNote] = createSignal("");
  const [newProjError, setNewProjError] = createSignal("");
  const [newProjSubmitting, setNewProjSubmitting] = createSignal(false);

  // Expanded project
  const [expandedProjectId, setExpandedProjectId] = createSignal<string | null>(null);

  // Add product to expanded project form
  const [showAddProd, setShowAddProd] = createSignal(false);
  const [addProdProductId, setAddProdProductId] = createSignal("");
  const [addProdRate, setAddProdRate] = createSignal(10);
  const [addProdError, setAddProdError] = createSignal("");
  const [addProdSuccess, setAddProdSuccess] = createSignal("");
  const [addProdSubmitting, setAddProdSubmitting] = createSignal(false);

  // ── Resources ──────────────────────────────────────────────────
  const [partners, { refetch: refetchPartners }] = createResource(
    () => isAdmin(),
    (isA) => (isA ? fetchPartners() : Promise.resolve([] as Profile[]))
  );

  const [allProducts] = createResource(
    () => isAdmin(),
    (isA) => (isA ? fetchAllProducts() : Promise.resolve([] as Product[]))
  );

  const projectsKey = createMemo(() => ({
    isA: isAdmin(),
    pid: profile()?.id ?? "",
  }));

  const [projects, { refetch: refetchProjects }] = createResource(
    projectsKey,
    ({ isA, pid }) => {
      if (isA) return fetchAllProjects();
      if (pid) return fetchMyProjects(pid);
      return Promise.resolve([] as ProjectRow[]);
    }
  );

  const [projProducts, { refetch: refetchProjProducts }] = createResource(
    expandedProjectId,
    (id) => (id ? fetchProjectProducts(id) : Promise.resolve([] as ProjProductRow[]))
  );

  const [projMovements] = createResource(
    expandedProjectId,
    (id) => (id ? fetchProjectMovements(id) : Promise.resolve([] as ProjMovementRow[]))
  );

  const totalCommission = createMemo(() => {
    const pps = projProducts() ?? [];
    const mvs = projMovements() ?? [];
    return pps.reduce((sum, pp) => {
      if (!pp.products) return sum;
      const qty = mvs
        .filter((m) => m.product_id === pp.product_id)
        .reduce((s, m) => s + m.quantity, 0);
      return sum + qty * pp.products.unit_price * pp.commission_rate;
    }, 0);
  });

  // ── Handlers ───────────────────────────────────────────────────
  const toggleExpand = (projectId: string) => {
    if (expandedProjectId() === projectId) {
      setExpandedProjectId(null);
      setShowAddProd(false);
    } else {
      setExpandedProjectId(projectId);
      setShowAddProd(false);
      setAddProdProductId("");
      setAddProdRate(10);
      setAddProdError("");
      setAddProdSuccess("");
    }
  };

  const handleInvitePartner = async (e: Event) => {
    e.preventDefault();
    setInviteError("");
    setInviteSuccess("");
    setInviteSubmitting(true);

    const rawUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const supabaseUrl =
      rawUrl.startsWith("http") || rawUrl.includes(".")
        ? rawUrl
        : `https://${rawUrl}.supabase.co`;
    const token = session()?.access_token;

    const res = await fetch(`${supabaseUrl}/functions/v1/invite-partner`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ email: inviteEmail(), displayName: inviteName() }),
    });

    const json = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || json.error) {
      setInviteError(json.error ?? "發生未知錯誤");
      setInviteSubmitting(false);
      return;
    }

    setInviteSuccess(`邀請信已寄出至：${inviteEmail()}`);
    setInviteEmail("");
    setInviteName("");
    setInviteSubmitting(false);
    refetchPartners();
  };

  const handleCreateProject = async (e: Event) => {
    e.preventDefault();
    setNewProjError("");
    setNewProjSubmitting(true);

    const payload: CollaborationProjectInsert = {
      name: newProjName(),
      partner_id: newProjPartnerId(),
      start_date: newProjStartDate(),
      end_date: newProjEndDate() || null,
      note: newProjNote() || null,
    };

    const { error } = await supabase.from("collaboration_projects").insert(payload);
    if (error) {
      setNewProjError(error.message);
    } else {
      setPanelMode("view");
      setNewProjName("");
      setNewProjPartnerId("");
      setNewProjStartDate(today);
      setNewProjEndDate("");
      setNewProjNote("");
      refetchProjects();
    }
    setNewProjSubmitting(false);
  };

  const handleAddProductToProject = async (e: Event) => {
    e.preventDefault();
    const projId = expandedProjectId();
    if (!projId) return;
    setAddProdError("");
    setAddProdSuccess("");
    setAddProdSubmitting(true);

    const payload: CollaborationProjectProductInsert = {
      project_id: projId,
      product_id: addProdProductId(),
      commission_rate: addProdRate() / 100,
    };

    const { error } = await supabase
      .from("collaboration_project_products")
      .upsert(payload, { onConflict: "project_id,product_id" });

    if (error) {
      setAddProdError(error.message);
    } else {
      setAddProdSuccess("已新增商品");
      setAddProdProductId("");
      setAddProdRate(10);
      refetchProjProducts();
    }
    setAddProdSubmitting(false);
  };

  const handleToggleProjectStatus = async (project: ProjectRow) => {
    const newStatus = project.status === "active" ? "closed" : "active";
    await supabase
      .from("collaboration_projects")
      .update({ status: newStatus })
      .eq("id", project.id);
    refetchProjects();
  };

  const handleRemoveProjProduct = async (ppId: string) => {
    await supabase.from("collaboration_project_products").delete().eq("id", ppId);
    refetchProjProducts();
  };

  // ── JSX ────────────────────────────────────────────────────────
  return (
    <div>
      <h1 class={pageTitle}>合作專案分潤</h1>

      {/* Admin Management Panel */}
      <Show when={isAdmin()}>
        <div class={panelCard}>
          <div
            class={css({
              display: "flex",
              gap: "3",
              mb: panelMode() !== "view" ? "4" : "0",
            })}
          >
            <button
              class={panelMode() === "invite" ? activeTabBtn : tabBtn}
              onClick={() => setPanelMode(panelMode() === "invite" ? "view" : "invite")}
            >
              邀請廠商帳號
            </button>
            <button
              class={panelMode() === "new-project" ? activeTabBtn : tabBtn}
              onClick={() =>
                setPanelMode(panelMode() === "new-project" ? "view" : "new-project")
              }
            >
              + 新增合作專案
            </button>
          </div>

          {/* Invite form */}
          <Show when={panelMode() === "invite"}>
            <form onSubmit={handleInvitePartner} class={subForm}>
              <h3 class={subFormTitle}>邀請合作廠商帳號</h3>
              <Show when={inviteError()}>
                <div class={errorBox}>{inviteError()}</div>
              </Show>
              <Show when={inviteSuccess()}>
                <div class={successBox}>{inviteSuccess()}</div>
              </Show>
              <div class={formRow}>
                <div class={fieldGroup}>
                  <label class={label}>廠商名稱</label>
                  <input
                    type="text"
                    required
                    value={inviteName()}
                    onInput={(e) => setInviteName(e.currentTarget.value)}
                    class={input}
                    placeholder="例如：欣欣貿易"
                  />
                </div>
                <div class={fieldGroup}>
                  <label class={label}>登入 Email</label>
                  <input
                    type="email"
                    required
                    value={inviteEmail()}
                    onInput={(e) => setInviteEmail(e.currentTarget.value)}
                    class={input}
                    placeholder="partner@example.com"
                  />
                </div>
                <button type="submit" disabled={inviteSubmitting()} class={submitBtn}>
                  {inviteSubmitting() ? "建立中..." : "建立帳號"}
                </button>
              </div>
            </form>
          </Show>

          {/* New project form */}
          <Show when={panelMode() === "new-project"}>
            <form onSubmit={handleCreateProject} class={subForm}>
              <h3 class={subFormTitle}>新增合作專案</h3>
              <Show when={newProjError()}>
                <div class={errorBox}>{newProjError()}</div>
              </Show>
              <div class={formRow}>
                <div class={fieldGroup}>
                  <label class={label}>廠商 *</label>
                  <select
                    required
                    value={newProjPartnerId()}
                    onChange={(e) => setNewProjPartnerId(e.currentTarget.value)}
                    class={select}
                  >
                    <option value="">-- 請選擇廠商 --</option>
                    <For each={partners()}>
                      {(p) => (
                        <option value={p.id}>{p.display_name ?? p.email}</option>
                      )}
                    </For>
                  </select>
                </div>
                <div class={fieldGroup}>
                  <label class={label}>專案名稱 *</label>
                  <input
                    type="text"
                    required
                    value={newProjName()}
                    onInput={(e) => setNewProjName(e.currentTarget.value)}
                    class={input}
                    placeholder="例如：2025 春季促銷"
                  />
                </div>
                <div class={fieldGroup}>
                  <label class={label}>開始日期 *</label>
                  <input
                    type="date"
                    required
                    value={newProjStartDate()}
                    onInput={(e) => setNewProjStartDate(e.currentTarget.value)}
                    class={input}
                  />
                </div>
                <div class={fieldGroup}>
                  <label class={label}>結束日期</label>
                  <input
                    type="date"
                    value={newProjEndDate()}
                    onInput={(e) => setNewProjEndDate(e.currentTarget.value)}
                    class={input}
                  />
                </div>
                <div class={fieldGroup}>
                  <label class={label}>備註</label>
                  <input
                    type="text"
                    value={newProjNote()}
                    onInput={(e) => setNewProjNote(e.currentTarget.value)}
                    class={input}
                    placeholder="選填"
                  />
                </div>
                <button type="submit" disabled={newProjSubmitting()} class={submitBtn}>
                  {newProjSubmitting() ? "建立中..." : "建立專案"}
                </button>
              </div>
            </form>
          </Show>
        </div>
      </Show>

      {/* Projects List */}
      <div class={panelCard}>
        <h2 class={sectionTitle}>合作專案記錄</h2>

        <Show when={projects.loading}>
          <p class={loadingText}>載入中...</p>
        </Show>

        <Show when={!projects.loading && (projects() ?? []).length === 0}>
          <p class={emptyText}>目前沒有合作專案</p>
        </Show>

        <div class={css({ display: "flex", flexDir: "column", gap: "3" })}>
          <For each={projects()}>
            {(project) => {
              const partnerLabel = () => {
                const p = project.profiles;
                return p ? (p.display_name ?? p.email) : project.partner_id;
              };
              const isExpanded = () => expandedProjectId() === project.id;

              return (
                <div class={projectCard}>
                  {/* Project header row */}
                  <button class={projectHeader} onClick={() => toggleExpand(project.id)}>
                    <div
                      class={css({
                        display: "flex",
                        gap: "3",
                        alignItems: "center",
                        flexWrap: "wrap",
                        flex: "1",
                      })}
                    >
                      <Show when={isAdmin()}>
                        <span class={css({ fontSize: "sm", color: "gray.500" })}>
                          {partnerLabel()}
                        </span>
                        <span class={css({ color: "gray.300" })}>|</span>
                      </Show>
                      <span class={css({ fontWeight: "semibold", color: "gray.800" })}>
                        {project.name}
                      </span>
                      <span class={css({ fontSize: "sm", color: "gray.500" })}>
                        {project.start_date} ～ {project.end_date ?? "進行中"}
                      </span>
                      <span class={project.status === "active" ? statusActive : statusClosed}>
                        {project.status === "active" ? "進行中" : "已關閉"}
                      </span>
                      <Show when={project.note}>
                        <span class={css({ fontSize: "xs", color: "gray.400" })}>
                          {project.note}
                        </span>
                      </Show>
                    </div>
                    <span class={css({ color: "gray.400", flexShrink: "0" })}>
                      {isExpanded() ? "▲" : "▼"}
                    </span>
                  </button>

                  {/* Expanded detail */}
                  <Show when={isExpanded()}>
                    <div class={projectDetail}>
                      <Show when={projProducts.loading || projMovements.loading}>
                        <p class={loadingText}>載入中...</p>
                      </Show>

                      <Show when={!projProducts.loading && !projMovements.loading}>
                        <Show when={(projProducts() ?? []).length === 0}>
                          <p class={emptyText}>此專案尚未指定商品</p>
                        </Show>

                        <Show when={(projProducts() ?? []).length > 0}>
                          <div class={css({ overflowX: "auto" })}>
                            <table class={table}>
                              <thead>
                                <tr>
                                  <th class={th}>SKU</th>
                                  <th class={th}>商品名稱</th>
                                  <th class={th}>單位</th>
                                  <th class={th}>單價</th>
                                  <th class={th}>出貨量</th>
                                  <th class={th}>分潤%</th>
                                  <th class={th}>小計</th>
                                  <Show when={isAdmin()}>
                                    <th class={th}></th>
                                  </Show>
                                </tr>
                              </thead>
                              <tbody>
                                <For each={projProducts()}>
                                  {(pp) => {
                                    if (!pp.products) return null;
                                    const qty = (projMovements() ?? [])
                                      .filter((m) => m.product_id === pp.product_id)
                                      .reduce((s, m) => s + m.quantity, 0);
                                    const subtotal =
                                      qty * pp.products.unit_price * pp.commission_rate;
                                    return (
                                      <tr class={css({ _hover: { bg: "gray.50" } })}>
                                        <td class={td}>
                                          <span
                                            class={css({ fontFamily: "mono", fontSize: "xs" })}
                                          >
                                            {pp.products.sku}
                                          </span>
                                        </td>
                                        <td class={td}>{pp.products.name}</td>
                                        <td class={td}>{pp.products.unit}</td>
                                        <td class={td}>
                                          ${pp.products.unit_price.toFixed(2)}
                                        </td>
                                        <td class={td}>{qty}</td>
                                        <td class={td}>
                                          {(pp.commission_rate * 100).toFixed(1)}%
                                        </td>
                                        <td class={td}>
                                          <span
                                            class={css({
                                              fontWeight: "semibold",
                                              color: "blue.700",
                                            })}
                                          >
                                            ${subtotal.toFixed(2)}
                                          </span>
                                        </td>
                                        <Show when={isAdmin()}>
                                          <td class={td}>
                                            <button
                                              class={removeBtnSmall}
                                              onClick={() => handleRemoveProjProduct(pp.id)}
                                            >
                                              移除
                                            </button>
                                          </td>
                                        </Show>
                                      </tr>
                                    );
                                  }}
                                </For>
                              </tbody>
                              <tfoot>
                                <tr>
                                  <td
                                    colSpan={6}
                                    class={css({
                                      ...tdStyles,
                                      textAlign: "right",
                                      fontWeight: "semibold",
                                      color: "gray.700",
                                      bg: "gray.50",
                                    })}
                                  >
                                    總計分潤
                                  </td>
                                  <td
                                    class={css({
                                      ...tdStyles,
                                      fontWeight: "bold",
                                      color: "blue.700",
                                      fontSize: "md",
                                      bg: "gray.50",
                                    })}
                                  >
                                    ${totalCommission().toFixed(2)}
                                  </td>
                                  <Show when={isAdmin()}>
                                    <td class={css({ ...tdStyles, bg: "gray.50" })}></td>
                                  </Show>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </Show>

                        {/* Admin controls */}
                        <Show when={isAdmin()}>
                          <div
                            class={css({
                              mt: "4",
                              display: "flex",
                              gap: "3",
                              alignItems: "flex-start",
                              flexWrap: "wrap",
                            })}
                          >
                            <button
                              class={tabBtn}
                              onClick={() => {
                                setShowAddProd(!showAddProd());
                                setAddProdError("");
                                setAddProdSuccess("");
                              }}
                            >
                              {showAddProd() ? "取消" : "+ 新增商品到專案"}
                            </button>
                            <button
                              class={project.status === "active" ? dangerBtn : tabBtn}
                              onClick={() => handleToggleProjectStatus(project)}
                            >
                              {project.status === "active" ? "關閉專案" : "重新開啟"}
                            </button>
                          </div>

                          {/* Add product form */}
                          <Show when={showAddProd()}>
                            <form onSubmit={handleAddProductToProject} class={subFormInner}>
                              <h4 class={subFormTitle}>新增商品並設定分潤</h4>
                              <Show when={addProdError()}>
                                <div class={errorBox}>{addProdError()}</div>
                              </Show>
                              <Show when={addProdSuccess()}>
                                <div class={successBox}>{addProdSuccess()}</div>
                              </Show>
                              <div class={formRow}>
                                <div class={fieldGroup}>
                                  <label class={label}>選擇商品</label>
                                  <select
                                    required
                                    value={addProdProductId()}
                                    onChange={(e) =>
                                      setAddProdProductId(e.currentTarget.value)
                                    }
                                    class={select}
                                  >
                                    <option value="">-- 請選擇商品 --</option>
                                    <For each={allProducts()}>
                                      {(p) => (
                                        <option value={p.id}>
                                          [{p.sku}] {p.name}
                                        </option>
                                      )}
                                    </For>
                                  </select>
                                </div>
                                <div class={fieldGroup}>
                                  <label class={label}>分潤比例 (%)</label>
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.1"
                                    required
                                    value={addProdRate()}
                                    onInput={(e) =>
                                      setAddProdRate(parseFloat(e.currentTarget.value) || 0)
                                    }
                                    class={css({ ...inputStyles, w: "120px" })}
                                  />
                                </div>
                                <button
                                  type="submit"
                                  disabled={addProdSubmitting()}
                                  class={submitBtn}
                                >
                                  {addProdSubmitting() ? "新增中..." : "新增"}
                                </button>
                              </div>
                            </form>
                          </Show>
                        </Show>
                      </Show>
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputStyles = {
  w: "100%",
  px: "3",
  py: "2",
  border: "1px solid",
  borderColor: "gray.300",
  borderRadius: "md",
  fontSize: "sm",
  outline: "none",
  _focus: { borderColor: "blue.500", ring: "2px", ringColor: "blue.200" },
} as const;

const tdStyles = {
  px: "4",
  py: "3",
  borderBottom: "1px solid",
  borderColor: "gray.100",
  color: "gray.700",
} as const;

const pageTitle = css({
  fontSize: "xl",
  fontWeight: "bold",
  color: "gray.900",
  mb: "6",
});

const sectionTitle = css({
  fontSize: "md",
  fontWeight: "semibold",
  color: "gray.800",
  mb: "4",
});

const panelCard = css({
  bg: "white",
  borderRadius: "lg",
  shadow: "sm",
  p: "6",
  mb: "6",
});

const projectCard = css({
  border: "1px solid",
  borderColor: "gray.200",
  borderRadius: "md",
  overflow: "hidden",
});

const projectHeader = css({
  w: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  px: "4",
  py: "3",
  bg: "white",
  border: "none",
  cursor: "pointer",
  textAlign: "left",
  _hover: { bg: "gray.50" },
});

const projectDetail = css({
  px: "4",
  py: "4",
  bg: "gray.50",
  borderTop: "1px solid",
  borderColor: "gray.200",
});

const statusActive = css({
  display: "inline-flex",
  alignItems: "center",
  px: "2",
  py: "0.5",
  borderRadius: "full",
  fontSize: "xs",
  fontWeight: "medium",
  bg: "green.100",
  color: "green.700",
});

const statusClosed = css({
  display: "inline-flex",
  alignItems: "center",
  px: "2",
  py: "0.5",
  borderRadius: "full",
  fontSize: "xs",
  fontWeight: "medium",
  bg: "gray.100",
  color: "gray.600",
});

const tabBtn = css({
  px: "4",
  py: "2",
  bg: "gray.100",
  color: "gray.700",
  borderRadius: "md",
  fontSize: "sm",
  cursor: "pointer",
  border: "none",
  _hover: { bg: "gray.200" },
});

const activeTabBtn = css({
  px: "4",
  py: "2",
  bg: "blue.600",
  color: "white",
  borderRadius: "md",
  fontSize: "sm",
  cursor: "pointer",
  border: "none",
  _hover: { bg: "blue.700" },
});

const dangerBtn = css({
  px: "4",
  py: "2",
  bg: "red.50",
  color: "red.600",
  borderRadius: "md",
  fontSize: "sm",
  cursor: "pointer",
  border: "1px solid",
  borderColor: "red.200",
  _hover: { bg: "red.100" },
});

const removeBtnSmall = css({
  color: "red.500",
  fontSize: "xs",
  cursor: "pointer",
  bg: "none",
  border: "none",
  _hover: { color: "red.700", textDecoration: "underline" },
});

const subForm = css({
  bg: "gray.50",
  borderRadius: "md",
  p: "4",
  border: "1px solid",
  borderColor: "gray.200",
});

const subFormInner = css({
  bg: "white",
  borderRadius: "md",
  p: "4",
  mt: "3",
  border: "1px solid",
  borderColor: "gray.200",
});

const subFormTitle = css({
  fontSize: "sm",
  fontWeight: "semibold",
  color: "gray.700",
  mb: "3",
});

const formRow = css({
  display: "flex",
  gap: "3",
  flexWrap: "wrap",
  alignItems: "flex-end",
});

const fieldGroup = css({
  display: "flex",
  flexDir: "column",
  gap: "1",
  minW: "160px",
});

const label = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "gray.700",
});

const input = css(inputStyles);

const select = css({
  ...inputStyles,
  bg: "white",
});

const submitBtn = css({
  px: "4",
  py: "2",
  bg: "blue.600",
  color: "white",
  borderRadius: "md",
  fontSize: "sm",
  fontWeight: "medium",
  border: "none",
  cursor: "pointer",
  _hover: { bg: "blue.700" },
  _disabled: { opacity: 0.6, cursor: "default" },
});

const errorBox = css({
  bg: "red.50",
  color: "red.700",
  p: "3",
  borderRadius: "md",
  fontSize: "sm",
  mb: "3",
  border: "1px solid",
  borderColor: "red.200",
});

const successBox = css({
  bg: "green.50",
  color: "green.700",
  p: "3",
  borderRadius: "md",
  fontSize: "sm",
  mb: "3",
  border: "1px solid",
  borderColor: "green.200",
});

const loadingText = css({ color: "gray.500", py: "8", textAlign: "center" });
const emptyText = css({ color: "gray.400", py: "8", textAlign: "center" });

const table = css({
  w: "100%",
  borderCollapse: "collapse",
  fontSize: "sm",
});

const th = css({
  textAlign: "left",
  px: "4",
  py: "3",
  bg: "gray.100",
  fontWeight: "semibold",
  color: "gray.600",
  fontSize: "xs",
  textTransform: "uppercase",
  letterSpacing: "wider",
  borderBottom: "1px solid",
  borderColor: "gray.200",
});

const td = css(tdStyles);
