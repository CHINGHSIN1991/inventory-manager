import { createSignal, createResource, For, Show, createMemo } from "solid-js";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import type { Profile, Product, PartnerProductInsert } from "../lib/database.types";
import { css } from "../../styled-system/css";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PartnerProductRow {
  id: string;
  partner_id: string;
  product_id: string;
  commission_rate: number;
  products: { id: string; sku: string; name: string; unit: string; unit_price: number } | null;
}

interface StockMovementRow {
  id: string;
  product_id: string;
  quantity: number;
  created_at: string;
}

interface CommissionLine {
  sku: string;
  name: string;
  unit: string;
  unit_price: number;
  out_qty: number;
  commission_rate: number;
  subtotal: number;
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
    .order("name");
  if (error) throw error;
  return data ?? [];
}

async function fetchPartnerProducts(partnerId: string): Promise<PartnerProductRow[]> {
  const { data, error } = await supabase
    .from("partner_products")
    .select("id, partner_id, product_id, commission_rate, products(id, sku, name, unit, unit_price)")
    .eq("partner_id", partnerId);
  if (error) throw error;
  return (data ?? []) as PartnerProductRow[];
}

async function fetchOutMovements(
  productIds: string[],
  from: string,
  to: string
): Promise<StockMovementRow[]> {
  if (!productIds.length) return [];
  const { data, error } = await supabase
    .from("stock_movements")
    .select("id, product_id, quantity, created_at")
    .eq("type", "out")
    .in("product_id", productIds)
    .gte("created_at", from + "T00:00:00Z")
    .lte("created_at", to + "T23:59:59Z");
  if (error) throw error;
  return data ?? [];
}

// ─── Main component ──────────────────────────────────────────────────────────

export function CommissionPage() {
  const { profile } = useAuth();

  const isAdmin = () => profile()?.role === "admin";
  const isPartner = () => profile()?.role === "partner";

  // date range
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 7) + "-01";
  const [dateFrom, setDateFrom] = createSignal(firstOfMonth);
  const [dateTo, setDateTo] = createSignal(today);

  // admin — selected partner
  const [selectedPartnerId, setSelectedPartnerId] = createSignal<string>("");

  // admin management panel state
  const [mgmtMode, setMgmtMode] = createSignal<"view" | "add-partner" | "add-product">("view");
  const [newPartnerEmail, setNewPartnerEmail] = createSignal("");
  const [newPartnerName, setNewPartnerName] = createSignal("");
  const [newPartnerError, setNewPartnerError] = createSignal("");
  const [newPartnerSuccess, setNewPartnerSuccess] = createSignal("");
  const [newPartnerSubmitting, setNewPartnerSubmitting] = createSignal(false);

  const [addProductPartnerId, setAddProductPartnerId] = createSignal("");
  const [addProductId, setAddProductId] = createSignal("");
  const [addProductRate, setAddProductRate] = createSignal(10); // percent
  const [addProductError, setAddProductError] = createSignal("");
  const [addProductSuccess, setAddProductSuccess] = createSignal("");
  const [addProductSubmitting, setAddProductSubmitting] = createSignal(false);

  // data resources
  const [partners, { refetch: refetchPartners }] = createResource(() => isAdmin(), (isA) =>
    isA ? fetchPartners() : Promise.resolve([] as Profile[])
  );
  const [allProducts] = createResource(() => isAdmin(), (isA) =>
    isA ? fetchAllProducts() : Promise.resolve([] as Product[])
  );

  // effective partner id (admin chooses; partner is themselves)
  const effectivePartnerId = () =>
    isAdmin() ? selectedPartnerId() : (profile()?.id ?? "");

  const [partnerProducts, { refetch: refetchPartnerProducts }] = createResource(
    effectivePartnerId,
    (id) => (id ? fetchPartnerProducts(id) : Promise.resolve([] as PartnerProductRow[]))
  );

  const productIds = createMemo(() =>
    (partnerProducts() ?? []).map((pp) => pp.product_id)
  );

  // trigger movements fetch when productIds + dates change
  const movementKey = createMemo(() => ({
    ids: productIds(),
    from: dateFrom(),
    to: dateTo(),
  }));

  const [movements] = createResource(movementKey, ({ ids, from, to }) =>
    fetchOutMovements(ids, from, to)
  );

  // ── commission lines calculation ────────────────────────────────────────
  const commissionLines = createMemo<CommissionLine[]>(() => {
    const pps = partnerProducts() ?? [];
    const mvs = movements() ?? [];
    return pps
      .map((pp) => {
        if (!pp.products) return null;
        const qty = mvs
          .filter((m) => m.product_id === pp.product_id)
          .reduce((sum, m) => sum + m.quantity, 0);
        const subtotal = qty * pp.products.unit_price * pp.commission_rate;
        return {
          sku: pp.products.sku,
          name: pp.products.name,
          unit: pp.products.unit,
          unit_price: pp.products.unit_price,
          out_qty: qty,
          commission_rate: pp.commission_rate,
          subtotal,
        } as CommissionLine;
      })
      .filter(Boolean) as CommissionLine[];
  });

  const totalCommission = createMemo(() =>
    commissionLines().reduce((sum, l) => sum + l.subtotal, 0)
  );

  // ── selected partner display name ────────────────────────────────────────
  const selectedPartnerName = createMemo(() => {
    if (isPartner()) return profile()?.display_name ?? profile()?.email ?? "";
    const p = (partners() ?? []).find((p) => p.id === selectedPartnerId());
    return p ? (p.display_name ?? p.email) : "";
  });

  // ── PDF export ───────────────────────────────────────────────────────────
  const handleExportPDF = () => {
    const doc = new jsPDF();
    const partnerLabel = selectedPartnerName();

    doc.setFontSize(16);
    doc.text("商品分潤報表", 14, 20);

    doc.setFontSize(11);
    doc.text(`合作廠商：${partnerLabel}`, 14, 32);
    doc.text(`日期範圍：${dateFrom()} ～ ${dateTo()}`, 14, 40);

    autoTable(doc, {
      startY: 50,
      head: [["SKU", "商品名稱", "單位", "單價", "出貨量", "抽成比例", "小計"]],
      body: commissionLines().map((l) => [
        l.sku,
        l.name,
        l.unit,
        `$${l.unit_price.toFixed(2)}`,
        l.out_qty.toString(),
        `${(l.commission_rate * 100).toFixed(1)}%`,
        `$${l.subtotal.toFixed(2)}`,
      ]),
      foot: [["", "", "", "", "", "總計分潤", `$${totalCommission().toFixed(2)}`]],
      styles: { fontSize: 10 },
      headStyles: { fillColor: [37, 99, 235] },
      footStyles: { fontStyle: "bold" },
    });

    doc.save(`分潤報表_${partnerLabel}_${dateFrom()}_${dateTo()}.pdf`);
  };

  // ── add partner handler ──────────────────────────────────────────────────
  const handleAddPartner = async (e: Event) => {
    e.preventDefault();
    setNewPartnerError("");
    setNewPartnerSuccess("");
    setNewPartnerSubmitting(true);

    const { error } = await supabase.auth.admin.createUser({
      email: newPartnerEmail(),
      password: Math.random().toString(36).slice(-12),
      email_confirm: true,
      user_metadata: { display_name: newPartnerName() },
    });

    if (error) {
      // Fallback: try signUp (works if admin can't use admin API from client)
      const { error: signupErr } = await supabase.auth.signUp({
        email: newPartnerEmail(),
        password: Math.random().toString(36).slice(-12),
        options: { data: { display_name: newPartnerName() } },
      });
      if (signupErr) {
        setNewPartnerError(signupErr.message);
        setNewPartnerSubmitting(false);
        return;
      }
    }

    // Set role to partner — wait briefly for trigger to create profile
    await new Promise((r) => setTimeout(r, 1000));
    const { data: profileData } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", newPartnerEmail())
      .maybeSingle();

    if (profileData) {
      await supabase
        .from("profiles")
        .update({ role: "partner" })
        .eq("id", profileData.id);
    }

    setNewPartnerSuccess(`廠商帳號已建立：${newPartnerEmail()}`);
    setNewPartnerEmail("");
    setNewPartnerName("");
    setNewPartnerSubmitting(false);
    refetchPartners();
  };

  // ── add product assignment handler ────────────────────────────────────────
  const handleAddProduct = async (e: Event) => {
    e.preventDefault();
    setAddProductError("");
    setAddProductSuccess("");
    setAddProductSubmitting(true);

    const payload: PartnerProductInsert = {
      partner_id: addProductPartnerId(),
      product_id: addProductId(),
      commission_rate: addProductRate() / 100,
    };

    const { error } = await supabase.from("partner_products").upsert(payload, {
      onConflict: "partner_id,product_id",
    });

    if (error) {
      setAddProductError(error.message);
    } else {
      setAddProductSuccess("已成功指定商品分潤");
      setAddProductId("");
      setAddProductRate(10);
      refetchPartnerProducts();
    }
    setAddProductSubmitting(false);
  };

  return (
    <div>
      <h1 class={pageTitle}>分潤管理</h1>

      {/* ── Admin Management Panel ─────────────────────────────────── */}
      <Show when={isAdmin()}>
        <div class={panelCard}>
          <div class={css({ display: "flex", gap: "3", mb: "4" })}>
            <button
              class={mgmtMode() === "add-partner" ? activeTabBtn : tabBtn}
              onClick={() => setMgmtMode(mgmtMode() === "add-partner" ? "view" : "add-partner")}
            >
              + 新增廠商帳號
            </button>
            <button
              class={mgmtMode() === "add-product" ? activeTabBtn : tabBtn}
              onClick={() => setMgmtMode(mgmtMode() === "add-product" ? "view" : "add-product")}
            >
              + 指定商品 / 抽成
            </button>
          </div>

          {/* Add partner form */}
          <Show when={mgmtMode() === "add-partner"}>
            <form onSubmit={handleAddPartner} class={subForm}>
              <h3 class={subFormTitle}>新增合作廠商帳號</h3>
              <Show when={newPartnerError()}>
                <div class={errorBox}>{newPartnerError()}</div>
              </Show>
              <Show when={newPartnerSuccess()}>
                <div class={successBox}>{newPartnerSuccess()}</div>
              </Show>
              <div class={formRow}>
                <div class={fieldGroup}>
                  <label class={label}>廠商名稱</label>
                  <input
                    type="text"
                    required
                    value={newPartnerName()}
                    onInput={(e) => setNewPartnerName(e.currentTarget.value)}
                    class={input}
                    placeholder="例如：欣欣貿易"
                  />
                </div>
                <div class={fieldGroup}>
                  <label class={label}>登入 Email</label>
                  <input
                    type="email"
                    required
                    value={newPartnerEmail()}
                    onInput={(e) => setNewPartnerEmail(e.currentTarget.value)}
                    class={input}
                    placeholder="partner@example.com"
                  />
                </div>
                <button type="submit" disabled={newPartnerSubmitting()} class={submitBtn}>
                  {newPartnerSubmitting() ? "建立中..." : "建立帳號"}
                </button>
              </div>
            </form>
          </Show>

          {/* Add product assignment form */}
          <Show when={mgmtMode() === "add-product"}>
            <form onSubmit={handleAddProduct} class={subForm}>
              <h3 class={subFormTitle}>指定商品給廠商並設定抽成比例</h3>
              <Show when={addProductError()}>
                <div class={errorBox}>{addProductError()}</div>
              </Show>
              <Show when={addProductSuccess()}>
                <div class={successBox}>{addProductSuccess()}</div>
              </Show>
              <div class={formRow}>
                <div class={fieldGroup}>
                  <label class={label}>選擇廠商</label>
                  <select
                    required
                    value={addProductPartnerId()}
                    onChange={(e) => setAddProductPartnerId(e.currentTarget.value)}
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
                  <label class={label}>選擇商品</label>
                  <select
                    required
                    value={addProductId()}
                    onChange={(e) => setAddProductId(e.currentTarget.value)}
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
                  <label class={label}>抽成比例 (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    required
                    value={addProductRate()}
                    onInput={(e) => setAddProductRate(parseFloat(e.currentTarget.value) || 0)}
                    class={css({ ...inputStyles, w: "100px" })}
                  />
                </div>
                <button type="submit" disabled={addProductSubmitting()} class={submitBtn}>
                  {addProductSubmitting() ? "儲存中..." : "儲存"}
                </button>
              </div>
            </form>
          </Show>
        </div>
      </Show>

      {/* ── Report Section ─────────────────────────────────────────── */}
      <div class={panelCard}>
        {/* Controls */}
        <div class={css({ display: "flex", gap: "4", flexWrap: "wrap", alignItems: "flex-end", mb: "5" })}>
          <Show when={isAdmin()}>
            <div class={fieldGroup}>
              <label class={label}>選擇廠商</label>
              <select
                value={selectedPartnerId()}
                onChange={(e) => setSelectedPartnerId(e.currentTarget.value)}
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
          </Show>

          <div class={fieldGroup}>
            <label class={label}>開始日期</label>
            <input
              type="date"
              value={dateFrom()}
              onInput={(e) => setDateFrom(e.currentTarget.value)}
              class={input}
            />
          </div>

          <div class={fieldGroup}>
            <label class={label}>結束日期</label>
            <input
              type="date"
              value={dateTo()}
              onInput={(e) => setDateTo(e.currentTarget.value)}
              class={input}
            />
          </div>

          <Show when={commissionLines().length > 0}>
            <button onClick={handleExportPDF} class={exportBtn}>
              匯出 PDF
            </button>
          </Show>
        </div>

        {/* Result message when no partner selected */}
        <Show when={!effectivePartnerId()}>
          <p class={emptyText}>請選擇廠商以查看分潤報表</p>
        </Show>

        <Show when={effectivePartnerId()}>
          {/* Loading */}
          <Show when={partnerProducts.loading || movements.loading}>
            <p class={loadingText}>載入中...</p>
          </Show>

          {/* Empty state */}
          <Show when={!partnerProducts.loading && !movements.loading && commissionLines().length === 0}>
            <p class={emptyText}>此廠商在選定期間內無出貨記錄</p>
          </Show>

          {/* Commission Table */}
          <Show when={commissionLines().length > 0}>
            <div class={css({ overflowX: "auto" })}>
              <table class={table}>
                <thead>
                  <tr>
                    <th class={th}>SKU</th>
                    <th class={th}>商品名稱</th>
                    <th class={th}>單位</th>
                    <th class={th}>單價</th>
                    <th class={th}>出貨量</th>
                    <th class={th}>抽成比例</th>
                    <th class={th}>小計</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={commissionLines()}>
                    {(line) => (
                      <tr class={css({ _hover: { bg: "gray.50" } })}>
                        <td class={td}>
                          <span class={css({ fontFamily: "mono", fontSize: "xs" })}>{line.sku}</span>
                        </td>
                        <td class={td}>{line.name}</td>
                        <td class={td}>{line.unit}</td>
                        <td class={td}>${line.unit_price.toFixed(2)}</td>
                        <td class={td}>{line.out_qty}</td>
                        <td class={td}>{(line.commission_rate * 100).toFixed(1)}%</td>
                        <td class={td}>
                          <span class={css({ fontWeight: "semibold", color: "blue.700" })}>
                            ${line.subtotal.toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={6} class={css({ ...tdStyles, textAlign: "right", fontWeight: "semibold", color: "gray.700", bg: "gray.50" })}>
                      總計分潤
                    </td>
                    <td class={css({ ...tdStyles, fontWeight: "bold", color: "blue.700", fontSize: "md", bg: "gray.50" })}>
                      ${totalCommission().toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Show>
        </Show>
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

const panelCard = css({
  bg: "white",
  borderRadius: "lg",
  shadow: "sm",
  p: "6",
  mb: "6",
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

const subForm = css({
  bg: "gray.50",
  borderRadius: "md",
  p: "4",
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

const exportBtn = css({
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
