import { createSignal, createResource, For, Show, createMemo } from "solid-js";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import type {
  Profile,
  Product,
  CollaborationProjectInsert,
  CollaborationProjectProductInsert,
  CollaborationProjectBundleInsert,
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

interface ProjBundleRow {
  id: string;
  project_id: string;
  bundle_id: string;
  commission_rate: number;
  bundles: { id: string; sku: string; name: string; price: number } | null;
}

interface BundleOrderRow {
  bundle_id: string;
  quantity: number;
}

interface BundleSimple {
  id: string;
  sku: string;
  name: string;
  price: number;
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

async function fetchActiveBundles(): Promise<BundleSimple[]> {
  const { data, error } = await supabase
    .from("bundles")
    .select("id, sku, name, price")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

async function fetchProjectBundles(projectId: string): Promise<ProjBundleRow[]> {
  const { data, error } = await supabase
    .from("collaboration_project_bundles")
    .select("*, bundles(id, sku, name, price)")
    .eq("project_id", projectId);
  if (error) throw error;
  return (data ?? []) as ProjBundleRow[];
}

async function fetchProjectBundleOrders(projectId: string): Promise<BundleOrderRow[]> {
  const { data: orderData, error: orderErr } = await supabase
    .from("orders")
    .select("id")
    .eq("project_id", projectId)
    .neq("status", "cancelled");
  if (orderErr || !orderData || orderData.length === 0) return [];
  const orderIds = orderData.map((o) => o.id);
  const { data, error } = await supabase
    .from("order_bundles")
    .select("bundle_id, quantity")
    .in("order_id", orderIds);
  if (error) throw error;
  return data ?? [];
}

// ─── Main component ──────────────────────────────────────────────────────────

export function CommissionPage() {
  const { profile, session } = useAuth();

  const isAdmin = () => profile()?.role === "admin";
  const today = new Date().toISOString().slice(0, 10);

  // ── Dialog visibility ────────────────────────────────────────────
  const [showInviteDialog, setShowInviteDialog] = createSignal(false);
  const [showNewProjectDialog, setShowNewProjectDialog] = createSignal(false);

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

  // Filters
  const [filterStatus, setFilterStatus] = createSignal<"active" | "closed" | "all">("active");
  const [filterPartnerId, setFilterPartnerId] = createSignal("");

  // Add product to expanded project form
  const [showAddProd, setShowAddProd] = createSignal(false);
  const [addProdItemId, setAddProdItemId] = createSignal("");
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

  const [allBundles] = createResource(
    () => isAdmin(),
    (isA) => (isA ? fetchActiveBundles() : Promise.resolve([] as BundleSimple[]))
  );

  const projectsKey = createMemo(() => ({
    isA: isAdmin(),
    pid: profile()?.id ?? "",
  }));

  const [projects, { refetch: refetchProjects }] = createResource(
    projectsKey,
    async ({ isA, pid }) => {
      let data: ProjectRow[];
      if (isA) data = await fetchAllProjects();
      else if (pid) data = await fetchMyProjects(pid);
      else return [] as ProjectRow[];

      // Auto-close projects whose end_date has passed
      const todayStr = new Date().toISOString().slice(0, 10);
      const expired = data.filter(
        (p) => p.status === "active" && p.end_date && p.end_date < todayStr
      );
      if (expired.length > 0) {
        await supabase
          .from("collaboration_projects")
          .update({ status: "closed" })
          .in("id", expired.map((p) => p.id));
        data = data.map((p) =>
          p.status === "active" && p.end_date && p.end_date < todayStr
            ? { ...p, status: "closed" as const }
            : p
        );
      }
      return data;
    }
  );

  const [projProducts, { refetch: refetchProjProducts }] = createResource(
    expandedProjectId,
    (id) => (id ? fetchProjectProducts(id) : Promise.resolve([] as ProjProductRow[]))
  );

  const [projBundles, { refetch: refetchProjBundles }] = createResource(
    expandedProjectId,
    (id) => (id ? fetchProjectBundles(id) : Promise.resolve([] as ProjBundleRow[]))
  );

  const [projMovements] = createResource(
    expandedProjectId,
    (id) => (id ? fetchProjectMovements(id) : Promise.resolve([] as ProjMovementRow[]))
  );

  const [projBundleOrders] = createResource(
    expandedProjectId,
    (id) => (id ? fetchProjectBundleOrders(id) : Promise.resolve([] as BundleOrderRow[]))
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

  const totalBundleCommission = createMemo(() => {
    const pbs = projBundles() ?? [];
    const bos = projBundleOrders() ?? [];
    return pbs.reduce((sum, pb) => {
      if (!pb.bundles) return sum;
      const qty = bos
        .filter((bo) => bo.bundle_id === pb.bundle_id)
        .reduce((s, bo) => s + bo.quantity, 0);
      return sum + qty * pb.bundles.price * pb.commission_rate;
    }, 0);
  });

  const grandTotalCommission = createMemo(() => totalCommission() + totalBundleCommission());

  const filteredProjects = createMemo(() => {
    const all = projects() ?? [];
    return all.filter((p) => {
      const fs = filterStatus();
      const statusMatch = fs === "all" || p.status === fs;
      const partnerMatch = !filterPartnerId() || p.partner_id === filterPartnerId();
      return statusMatch && partnerMatch;
    });
  });

  // ── Handlers ───────────────────────────────────────────────────
  const toggleExpand = (projectId: string) => {
    if (expandedProjectId() === projectId) {
      setExpandedProjectId(null);
      setShowAddProd(false);
    } else {
      setExpandedProjectId(projectId);
      setShowAddProd(false);
      setAddProdItemId("");
      setAddProdRate(10);
      setAddProdError("");
      setAddProdSuccess("");
    }
  };

  const exportProjectPDF = (project: ProjectRow) => {
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const pps = projProducts() ?? [];
    const mvs = projMovements() ?? [];
    const pbs = projBundles() ?? [];
    const bos = projBundleOrders() ?? [];
    const partnerName = project.profiles
      ? esc(project.profiles.display_name ?? project.profiles.email)
      : esc(project.partner_id);

    const productRows = pps
      .filter((pp) => pp.products)
      .map((pp) => {
        const qty = mvs
          .filter((m) => m.product_id === pp.product_id)
          .reduce((s, m) => s + m.quantity, 0);
        const subtotal = qty * pp.products!.unit_price * pp.commission_rate;
        return `<tr>
          <td>${esc(pp.products!.sku)}</td>
          <td>${esc(pp.products!.name)}</td>
          <td>${esc(pp.products!.unit)}</td>
          <td>$${pp.products!.unit_price.toFixed(2)}</td>
          <td>${qty}</td>
          <td>${(pp.commission_rate * 100).toFixed(1)}%</td>
          <td>$${subtotal.toFixed(2)}</td>
        </tr>`;
      })
      .join("");

    const bundleSectionHeader = pbs.filter((pb) => pb.bundles).length > 0
      ? `<tr><td colspan="7" style="background:#f5f3ff;font-weight:600;color:#6d28d9;padding:8px 12px">組合商品</td></tr>`
      : "";

    const bundleRows = pbs
      .filter((pb) => pb.bundles)
      .map((pb) => {
        const qty = bos
          .filter((bo) => bo.bundle_id === pb.bundle_id)
          .reduce((s, bo) => s + bo.quantity, 0);
        const subtotal = qty * pb.bundles!.price * pb.commission_rate;
        return `<tr>
          <td>${esc(pb.bundles!.sku)}</td>
          <td>${esc(pb.bundles!.name)}</td>
          <td>套</td>
          <td>$${pb.bundles!.price.toFixed(2)}</td>
          <td>${qty}</td>
          <td>${(pb.commission_rate * 100).toFixed(1)}%</td>
          <td>$${subtotal.toFixed(2)}</td>
        </tr>`;
      })
      .join("");

    const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <title>\u5206\u6f64\u5831\u8868 - ${esc(project.name)}</title>
  <style>
    body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; padding: 32px; color: #111; }
    h1 { font-size: 20px; margin: 0 0 16px; }
    .meta { font-size: 13px; color: #555; margin-bottom: 24px; line-height: 1.8; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #f3f4f6; text-align: left; padding: 8px 12px; border: 1px solid #d1d5db; font-weight: 600; }
    td { padding: 8px 12px; border: 1px solid #e5e7eb; }
    tfoot td { font-weight: bold; background: #f9fafb; }
    .print-date { font-size: 11px; color: #9ca3af; margin-top: 20px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>\u5408\u4f5c\u5c08\u6848\u5206\u6f64\u5831\u8868</h1>
  <div class="meta">
    <div>\u5c08\u6848\u540d\u7a31\uff1a${esc(project.name)}</div>
    <div>\u5408\u4f5c\u5ee0\u5546\uff1a${partnerName}</div>
    <div>\u671f\u9593\uff1a${esc(project.start_date)} \uff5e ${project.end_date ? esc(project.end_date) : "\u9032\u884c\u4e2d"}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>SKU</th><th>\u5546\u54c1\u540d\u7a31</th><th>\u55ae\u4f4d</th><th>\u55ae\u50f9</th><th>\u51fa\u8ca8\u91cf</th><th>\u5206\u6f64%</th><th>\u5c0f\u8a08</th>
      </tr>
    </thead>
    <tbody>${productRows}${bundleSectionHeader}${bundleRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="6" style="text-align:right">\u7e3d\u8a08\u5206\u6f64</td>
        <td>$${grandTotalCommission().toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>
  <p class="print-date">\u5217\u5370\u65e5\u671f\uff1a${new Date().toLocaleDateString("zh-TW")}</p>
  <script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`;

    const win = window.open("", "_blank", "width=900,height=700");
    if (win) {
      win.document.write(html);
      win.document.close();
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
      setShowNewProjectDialog(false);
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

    const itemId = addProdItemId();
    const colonIdx = itemId.indexOf(":");
    const type = itemId.slice(0, colonIdx);
    const id = itemId.slice(colonIdx + 1);

    if (type === "p") {
      const payload: CollaborationProjectProductInsert = {
        project_id: projId,
        product_id: id,
        commission_rate: addProdRate() / 100,
      };
      const { error } = await supabase
        .from("collaboration_project_products")
        .upsert(payload, { onConflict: "project_id,product_id" });
      if (error) {
        setAddProdError(error.message);
      } else {
        setAddProdSuccess("已新增商品");
        setAddProdItemId("");
        setAddProdRate(10);
        refetchProjProducts();
      }
    } else if (type === "b") {
      const payload: CollaborationProjectBundleInsert = {
        project_id: projId,
        bundle_id: id,
        commission_rate: addProdRate() / 100,
      };
      const { error } = await supabase
        .from("collaboration_project_bundles")
        .upsert(payload, { onConflict: "project_id,bundle_id" });
      if (error) {
        setAddProdError(error.message);
      } else {
        setAddProdSuccess("已新增組合商品");
        setAddProdItemId("");
        setAddProdRate(10);
        refetchProjBundles();
      }
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

  const handleRemoveProjBundle = async (pbId: string) => {
    await supabase.from("collaboration_project_bundles").delete().eq("id", pbId);
    refetchProjBundles();
  };

  // ── JSX ────────────────────────────────────────────────────────
  return (
    <div>
      {/* Page Header */}
      <div
        class={css({
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: "6",
        })}
      >
        <h1 class={pageTitle}>合作專案分潤</h1>
        <Show when={isAdmin()}>
          <div class={css({ display: "flex", gap: "2" })}>
            <button class={tabBtn} onClick={() => setShowInviteDialog(true)}>
              邀請廠商帳號
            </button>
            <button class={activeTabBtn} onClick={() => setShowNewProjectDialog(true)}>
              + 新增合作專案
            </button>
          </div>
        </Show>
      </div>

      {/* Filter Bar */}
      <div
        class={css({
          display: "flex",
          gap: "2",
          alignItems: "center",
          justifyContent: "space-between",
          bg: "white",
          borderRadius: "lg",
          shadow: "sm",
          px: "6",
          py: "4",
          mb: "6",
        })}
      >
        <div class={css({ display: "flex", gap: "2", alignItems: "center", flexWrap: "wrap" })}>
          <select
            value={filterStatus()}
            onChange={(e) =>
              setFilterStatus(e.currentTarget.value as "active" | "closed" | "all")
            }
            class={filterSelect}
          >
            <option value="active">進行中</option>
            <option value="closed">已結束</option>
            <option value="all">全部</option>
          </select>
          <Show when={isAdmin()}>
            <select
              value={filterPartnerId()}
              onChange={(e) => setFilterPartnerId(e.currentTarget.value)}
              class={filterSelect}
            >
              <option value="">全部廠商</option>
              <For each={partners()}>
                {(p) => (
                  <option value={p.id}>{p.display_name ?? p.email}</option>
                )}
              </For>
            </select>
          </Show>
        </div>
      </div>

      {/* Projects List */}
      <div class={panelCard}>
        <h2 class={sectionTitle}>合作專案記錄</h2>

        <Show when={projects.loading}>
          <p class={loadingText}>載入中...</p>
        </Show>

        <Show when={!projects.loading && filteredProjects().length === 0}>
          <p class={emptyText}>
            {(projects() ?? []).length === 0
              ? "目前沒有合作專案"
              : "沒有符合篩選條件的專案"}
          </p>
        </Show>

        <div class={css({ display: "flex", flexDir: "column", gap: "3" })}>
          <For each={filteredProjects()}>
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
                        {project.status === "active" ? "進行中" : "已結束"}
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
                      <Show when={projProducts.loading || projMovements.loading || projBundles.loading || projBundleOrders.loading}>
                        <p class={loadingText}>載入中...</p>
                      </Show>

                      <Show when={!projProducts.loading && !projMovements.loading && !projBundles.loading && !projBundleOrders.loading}>
                        <Show when={(projProducts() ?? []).length === 0 && (projBundles() ?? []).length === 0}>
                          <p class={emptyText}>此專案尚未指定商品</p>
                        </Show>

                        <Show when={(projProducts() ?? []).length > 0 || (projBundles() ?? []).length > 0}>
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
                                <Show when={(projProducts() ?? []).length > 0}>
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
                                </Show>

                                <Show when={(projBundles() ?? []).length > 0}>
                                  <tr>
                                    <td
                                      colSpan={isAdmin() ? 8 : 7}
                                      class={css({
                                        ...tdStyles,
                                        bg: "purple.50",
                                        color: "purple.700",
                                        fontWeight: "semibold",
                                        fontSize: "xs",
                                        letterSpacing: "wide",
                                      })}
                                    >
                                      組合商品
                                    </td>
                                  </tr>
                                  <For each={projBundles()}>
                                    {(pb) => {
                                      if (!pb.bundles) return null;
                                      const qty = (projBundleOrders() ?? [])
                                        .filter((bo) => bo.bundle_id === pb.bundle_id)
                                        .reduce((s, bo) => s + bo.quantity, 0);
                                      const subtotal =
                                        qty * pb.bundles.price * pb.commission_rate;
                                      return (
                                        <tr class={css({ _hover: { bg: "purple.50" } })}>
                                          <td class={td}>
                                            <span
                                              class={css({ fontFamily: "mono", fontSize: "xs" })}
                                            >
                                              {pb.bundles.sku}
                                            </span>
                                          </td>
                                          <td class={td}>{pb.bundles.name}</td>
                                          <td class={td}>套</td>
                                          <td class={td}>
                                            ${pb.bundles.price.toFixed(2)}
                                          </td>
                                          <td class={td}>{qty}</td>
                                          <td class={td}>
                                            {(pb.commission_rate * 100).toFixed(1)}%
                                          </td>
                                          <td class={td}>
                                            <span
                                              class={css({
                                                fontWeight: "semibold",
                                                color: "purple.700",
                                              })}
                                            >
                                              ${subtotal.toFixed(2)}
                                            </span>
                                          </td>
                                          <Show when={isAdmin()}>
                                            <td class={td}>
                                              <button
                                                class={removeBtnSmall}
                                                onClick={() => handleRemoveProjBundle(pb.id)}
                                              >
                                                移除
                                              </button>
                                            </td>
                                          </Show>
                                        </tr>
                                      );
                                    }}
                                  </For>
                                </Show>
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
                                    ${grandTotalCommission().toFixed(2)}
                                  </td>
                                  <Show when={isAdmin()}>
                                    <td class={css({ ...tdStyles, bg: "gray.50" })}></td>
                                  </Show>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </Show>

                        {/* Export button — visible to all */}
                        <div
                          class={css({
                            mt: "4",
                            display: "flex",
                            justifyContent: "flex-end",
                          })}
                        >
                          <button
                            class={css({
                              px: "4",
                              py: "2",
                              bg: "green.600",
                              color: "white",
                              borderRadius: "md",
                              fontSize: "sm",
                              fontWeight: "medium",
                              border: "none",
                              cursor: "pointer",
                              _hover: { bg: "green.700" },
                            })}
                            onClick={() => exportProjectPDF(project)}
                          >
                            &#x1F4C4; 匯出分潤報表
                          </button>
                        </div>

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
                              title={project.status === "closed" ? "重新開啟後，若結束日期仍在過去，下次頁面載入將再次自動關閉，請記得同時更新結束日期" : undefined}
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
                                  <label class={label}>選擇商品或組合</label>
                                  <select
                                    required
                                    value={addProdItemId()}
                                    onChange={(e) =>
                                      setAddProdItemId(e.currentTarget.value)
                                    }
                                    class={select}
                                  >
                                    <option value="">-- 請選擇商品或組合 --</option>
                                    <optgroup label="獨立商品">
                                      <For each={allProducts()}>
                                        {(p) => (
                                          <option value={`p:${p.id}`}>
                                            [{p.sku}] {p.name}
                                          </option>
                                        )}
                                      </For>
                                    </optgroup>
                                    <optgroup label="組合商品">
                                      <For each={allBundles()}>
                                        {(b) => (
                                          <option value={`b:${b.id}`}>
                                            [{b.sku}] {b.name}（${b.price.toFixed(2)}/套）
                                          </option>
                                        )}
                                      </For>
                                    </optgroup>
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

      {/* Invite Partner Dialog */}
      <Show when={showInviteDialog()}>
        <div
          class={overlay}
          onClick={(e) => e.target === e.currentTarget && setShowInviteDialog(false)}
        >
          <div class={dialogCard}>
            <div class={dialogHeader}>
              <h2 class={css({ fontSize: "lg", fontWeight: "bold", color: "gray.900" })}>
                邀請合作廠商帳號
              </h2>
              <button
                class={closeBtn}
                onClick={() => setShowInviteDialog(false)}
              >
                ✕
              </button>
            </div>
            <Show when={inviteError()}>
              <div class={errorBox}>{inviteError()}</div>
            </Show>
            <Show when={inviteSuccess()}>
              <div class={successBox}>{inviteSuccess()}</div>
            </Show>
            <form
              onSubmit={handleInvitePartner}
              class={css({ display: "flex", flexDir: "column", gap: "3" })}
            >
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
              <div class={css({ display: "flex", gap: "3", justifyContent: "flex-end", mt: "2" })}>
                <button
                  type="button"
                  class={tabBtn}
                  onClick={() => setShowInviteDialog(false)}
                >
                  取消
                </button>
                <button type="submit" disabled={inviteSubmitting()} class={submitBtn}>
                  {inviteSubmitting() ? "建立中..." : "建立帳號"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Show>

      {/* New Project Dialog */}
      <Show when={showNewProjectDialog()}>
        <div
          class={overlay}
          onClick={(e) => e.target === e.currentTarget && setShowNewProjectDialog(false)}
        >
          <div class={dialogCard}>
            <div class={dialogHeader}>
              <h2 class={css({ fontSize: "lg", fontWeight: "bold", color: "gray.900" })}>
                新增合作專案
              </h2>
              <button
                class={closeBtn}
                onClick={() => setShowNewProjectDialog(false)}
              >
                ✕
              </button>
            </div>
            <Show when={newProjError()}>
              <div class={errorBox}>{newProjError()}</div>
            </Show>
            <form
              onSubmit={handleCreateProject}
              class={css({ display: "flex", flexDir: "column", gap: "3" })}
            >
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
              <div class={css({ display: "flex", gap: "3" })}>
                <div class={css({ flex: 1 })}>
                  <label class={label}>開始日期 *</label>
                  <input
                    type="date"
                    required
                    value={newProjStartDate()}
                    onInput={(e) => setNewProjStartDate(e.currentTarget.value)}
                    class={input}
                  />
                </div>
                <div class={css({ flex: 1 })}>
                  <label class={label}>結束日期</label>
                  <input
                    type="date"
                    value={newProjEndDate()}
                    onInput={(e) => setNewProjEndDate(e.currentTarget.value)}
                    class={input}
                  />
                </div>
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
              <div class={css({ display: "flex", gap: "3", justifyContent: "flex-end", mt: "2" })}>
                <button
                  type="button"
                  class={tabBtn}
                  onClick={() => setShowNewProjectDialog(false)}
                >
                  取消
                </button>
                <button type="submit" disabled={newProjSubmitting()} class={submitBtn}>
                  {newProjSubmitting() ? "建立中..." : "建立專案"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Show>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const overlay = css({
  position: "fixed",
  inset: 0,
  bg: "blackAlpha.600",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 50,
  p: "4",
});

const dialogCard = css({
  bg: "white",
  borderRadius: "xl",
  p: "6",
  w: "full",
  maxW: "480px",
  maxH: "90vh",
  overflowY: "auto",
  boxShadow: "2xl",
});

const dialogHeader = css({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  mb: "4",
});

const closeBtn = css({
  bg: "transparent",
  border: "none",
  cursor: "pointer",
  fontSize: "xl",
  color: "gray.500",
  lineHeight: 1,
  _hover: { color: "gray.700" },
});

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

const filterSelect = css({
  ...inputStyles,
  bg: "white",
  w: "auto",
  minW: "140px",
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
