import { createSignal, createResource, For, Show, createMemo, Index } from "solid-js";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import type { Product } from "../lib/database.types";
import { css } from "../../styled-system/css";

type OrderStatus = "active" | "shipped" | "completed" | "cancelled";

const STATUS_LABEL: Record<OrderStatus, string> = {
  active: "出貨中",
  shipped: "已出貨",
  completed: "已完成",
  cancelled: "已撤銷",
};

const STATUS_COLOR: Record<OrderStatus, { bg: string; color: string }> = {
  active: { bg: "green.100", color: "green.700" },
  shipped: { bg: "blue.100", color: "blue.700" },
  completed: { bg: "purple.100", color: "purple.700" },
  cancelled: { bg: "red.100", color: "red.700" },
};

// Next allowed statuses for a given current status
const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  active: ["shipped", "cancelled"],
  shipped: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface ActiveProject {
  id: string;
  name: string;
}

interface OrderRow {
  id: string;
  order_number: string;
  project_id: string | null;
  note: string | null;
  status: OrderStatus;
  cancelled_note: string | null;
  created_at: string;
  profiles: { id: string; display_name: string | null; email: string } | null;
  collaboration_projects: { name: string } | null;
  order_items: { id: string; quantity: number; products: { sku: string; name: string; unit: string } | null }[];
}

interface BundleOption {
  id: string;
  sku: string;
  name: string;
  items: { productId: string; quantity: number; productName: string; productSku: string; stock: number }[];
}

// ─── Data fetchers ───────────────────────────────────────────────────────────

async function fetchOrders(): Promise<OrderRow[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, project_id, note, status, cancelled_note, created_at, profiles:created_by(id, display_name, email), collaboration_projects(name), order_items(id, quantity, products(sku, name, unit))"
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as OrderRow[];
}

async function fetchActiveProjects(): Promise<ActiveProject[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("collaboration_projects")
    .select("id, name, end_date")
    .eq("status", "active")
    .lte("start_date", today)
    .order("name");
  if (error) throw error;
  return (data ?? [])
    .filter((p) => !p.end_date || p.end_date >= today)
    .map((p) => ({ id: p.id, name: p.name }));
}

async function fetchAllProjectsForFilter(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from("collaboration_projects")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

async function fetchActiveProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

async function fetchActiveBundles(): Promise<BundleOption[]> {
  const { data, error } = await supabase
    .from("bundles")
    .select("id, sku, name, bundle_items(product_id, quantity, products(id, sku, name, quantity))")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return ((data ?? []) as unknown as {
    id: string; sku: string; name: string;
    bundle_items: { product_id: string; quantity: number; products: { id: string; sku: string; name: string; quantity: number } | null }[];
  }[]).map((b) => ({
    id: b.id,
    sku: b.sku,
    name: b.name,
    items: b.bundle_items.map((bi) => ({
      productId: bi.products?.id ?? bi.product_id,
      quantity: bi.quantity,
      productName: bi.products?.name ?? "",
      productSku: bi.products?.sku ?? "",
      stock: bi.products?.quantity ?? 0,
    })),
  }));
}

async function fetchOrderCreators(): Promise<{ id: string; display_name: string | null; email: string }[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .in("role", ["admin", "warehouse"])
    .order("display_name");
  if (error) throw error;
  return data ?? [];
}

// ─── Create Order Dialog ──────────────────────────────────────────────────────

interface OrderItem {
  productId: string;
  quantity: number;
}

interface CreateOrderDialogProps {
  onClose: () => void;
  onSuccess: () => void;
}

function CreateOrderDialog(props: CreateOrderDialogProps) {
  const { profile } = useAuth();
  const [projectId, setProjectId] = createSignal("");
  const [note, setNote] = createSignal("");
  const [items, setItems] = createSignal<OrderItem[]>([{ productId: "", quantity: 1 }]);
  const [bundleId, setBundleId] = createSignal("");
  const [error, setError] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);

  const [activeProjects] = createResource(fetchActiveProjects);
  const [allProducts] = createResource(fetchActiveProducts);
  const [activeBundles] = createResource(fetchActiveBundles);

  const addItem = () => setItems((prev) => [...prev, { productId: "", quantity: 1 }]);

  const removeItem = (idx: number) =>
    setItems((prev) => prev.filter((_, i) => i !== idx));

  const updateItem = (idx: number, field: keyof OrderItem, value: string | number) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const addBundle = () => {
    const bundle = (activeBundles() ?? []).find((b) => b.id === bundleId());
    if (!bundle) return;
    setItems((prev) => {
      const next = [...prev];
      for (const bi of bundle.items) {
        const existing = next.findIndex((i) => i.productId === bi.productId);
        if (existing >= 0) {
          next[existing] = { ...next[existing], quantity: next[existing].quantity + bi.quantity };
        } else {
          next.push({ productId: bi.productId, quantity: bi.quantity });
        }
      }
      // Remove empty placeholder if it's the only item and has no productId
      return next.filter((i, idx) => idx !== 0 || i.productId !== "" || next.length > 1 ? true : false).filter((i) => !(i.productId === "" && next.length > 1));
    });
    setBundleId("");
  };

  const selectedProductIds = createMemo(() => items().map((i) => i.productId).filter(Boolean));

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError("");

    const validItems = items().filter((i) => i.productId && i.quantity > 0);
    if (validItems.length === 0) {
      setError("請至少新增一項商品");
      return;
    }

    const products = allProducts() ?? [];

    // Check stock
    for (const item of validItems) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) continue;
      if (item.quantity > product.quantity) {
        setError(`庫存不足：${product.name}（目前庫存 ${product.quantity}）`);
        return;
      }
    }

    setSubmitting(true);

    // 1. Create order
    const { data: orderData, error: orderErr } = await supabase
      .from("orders")
      .insert({
        project_id: projectId() || null,
        note: note() || null,
        created_by: profile()!.id,
      })
      .select("id, order_number")
      .single();

    if (orderErr || !orderData) {
      setError(orderErr?.message ?? "建立訂單失敗");
      setSubmitting(false);
      return;
    }

    const orderId = orderData.id;

    // 2. Insert order_items
    const { error: itemsErr } = await supabase.from("order_items").insert(
      validItems.map((i) => ({
        order_id: orderId,
        product_id: i.productId,
        quantity: i.quantity,
      }))
    );

    if (itemsErr) {
      setError(itemsErr.message);
      setSubmitting(false);
      return;
    }

    // 3. Insert stock_movements (type=out) for each item
    let projectProductIds: Set<string> = new Set();
    if (projectId()) {
      const { data: ppData } = await supabase
        .from("collaboration_project_products")
        .select("product_id")
        .eq("project_id", projectId());
      projectProductIds = new Set((ppData ?? []).map((r) => r.product_id));
    }

    const movements = validItems.map((item) => ({
      product_id: item.productId,
      type: "out" as const,
      quantity: item.quantity,
      created_by: profile()!.id,
      order_id: orderId,
      project_id:
        projectId() && projectProductIds.has(item.productId) ? projectId() : null,
    }));

    const { error: movErr } = await supabase.from("stock_movements").insert(movements);

    if (movErr) {
      setError(movErr.message);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    props.onSuccess();
    props.onClose();
  };

  return (
    <div class={overlay} onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div
        class={css({
          bg: "white",
          borderRadius: "xl",
          p: "6",
          w: "full",
          maxW: "640px",
          maxH: "90vh",
          overflowY: "auto",
          boxShadow: "2xl",
        })}
      >
        <div
          class={css({
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: "4",
          })}
        >
          <h2 class={css({ fontSize: "lg", fontWeight: "bold" })}>建立出貨單</h2>
          <button
            onClick={props.onClose}
            class={css({
              bg: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: "xl",
              color: "gray.500",
              lineHeight: 1,
              _hover: { color: "gray.700" },
            })}
          >
            ✕
          </button>
        </div>

        <Show when={error()}>
          <div
            class={css({
              bg: "red.50",
              border: "1px solid",
              borderColor: "red.200",
              color: "red.700",
              p: "3",
              borderRadius: "md",
              mb: "4",
              fontSize: "sm",
            })}
          >
            {error()}
          </div>
        </Show>

        <form onSubmit={handleSubmit} class={css({ display: "flex", flexDir: "column", gap: "4" })}>
          {/* Project (commission) */}
          <div class={fieldGroup}>
            <label class={label}>分潤計畫（選填）</label>
            <Show when={!activeProjects.loading} fallback={<p class={css({ fontSize: "sm", color: "gray.400" })}>載入中...</p>}>
              <select
                value={projectId()}
                onChange={(e) => setProjectId(e.currentTarget.value)}
                class={input}
              >
                <option value="">— 不選擇分潤計畫 —</option>
                <For each={activeProjects()}>
                  {(p) => <option value={p.id}>{p.name}</option>}
                </For>
              </select>
            </Show>
          </div>

          {/* Note */}
          <div class={fieldGroup}>
            <label class={label}>備註（選填）</label>
            <input
              type="text"
              value={note()}
              onInput={(e) => setNote(e.currentTarget.value)}
              placeholder="備註說明..."
              class={input}
            />
          </div>

          {/* Bundle quick-add */}
          <Show when={(activeBundles()?.length ?? 0) > 0}>
            <div
              class={css({
                p: "3",
                bg: "purple.50",
                border: "1px solid",
                borderColor: "purple.200",
                borderRadius: "md",
              })}
            >
              <p class={css({ fontSize: "sm", fontWeight: "medium", color: "purple.700", mb: "2" })}>加入組合商品</p>
              <div class={css({ display: "flex", gap: "2" })}>
                <select
                  value={bundleId()}
                  onChange={(e) => setBundleId(e.currentTarget.value)}
                  class={input}
                  style={{ flex: "1" }}
                >
                  <option value="">— 選擇組合商品 —</option>
                  <For each={activeBundles()}>
                    {(b) => <option value={b.id}>[{b.sku}] {b.name}</option>}
                  </For>
                </select>
                <button
                  type="button"
                  onClick={addBundle}
                  disabled={!bundleId()}
                  class={css({
                    px: "3",
                    py: "2",
                    bg: "purple.600",
                    color: "white",
                    border: "none",
                    borderRadius: "md",
                    cursor: "pointer",
                    fontSize: "sm",
                    whiteSpace: "nowrap",
                    _hover: { bg: "purple.700" },
                    _disabled: { opacity: 0.4, cursor: "not-allowed" },
                  })}
                >
                  加入
                </button>
              </div>
              <Show when={bundleId()}>
                <div class={css({ mt: "2", display: "flex", flexWrap: "wrap", gap: "1" })}>
                  <For each={(activeBundles() ?? []).find((b) => b.id === bundleId())?.items ?? []}>
                    {(bi) => (
                      <span class={css({ fontSize: "xs", px: "2", py: "0.5", bg: "purple.100", color: "purple.700", borderRadius: "md" })}>
                        {bi.productName} × {bi.quantity}（庫存 {bi.stock}）
                      </span>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </Show>

          {/* Items */}
          <div>
            <div
              class={css({
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: "2",
              })}
            >
              <label class={label}>出貨商品 *</label>
              <button
                type="button"
                onClick={addItem}
                class={css({
                  fontSize: "sm",
                  color: "blue.600",
                  bg: "transparent",
                  border: "none",
                  cursor: "pointer",
                  _hover: { textDecoration: "underline" },
                })}
              >
                + 新增商品
              </button>
            </div>

            <div class={css({ display: "flex", flexDir: "column", gap: "2" })}>
              <Index each={items()}>
                {(item, idx) => (
                  <div
                    class={css({
                      display: "grid",
                      gridTemplateColumns: "1fr 100px 32px",
                      gap: "2",
                      alignItems: "center",
                    })}
                  >
                    <select
                      value={item().productId}
                      onChange={(e) => updateItem(idx, "productId", e.currentTarget.value)}
                      required
                      class={input}
                    >
                      <option value="">— 選擇商品 —</option>
                      <For each={allProducts()}>
                        {(p) => (
                          <option
                            value={p.id}
                            disabled={
                              selectedProductIds().includes(p.id) &&
                              item().productId !== p.id
                            }
                          >
                            [{p.sku}] {p.name}（庫存 {p.quantity}）
                          </option>
                        )}
                      </For>
                    </select>
                    <input
                      type="number"
                      min="1"
                      required
                      value={item().quantity}
                      onInput={(e) =>
                        updateItem(idx, "quantity", parseInt(e.currentTarget.value) || 1)
                      }
                      class={input}
                      placeholder="數量"
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      disabled={items().length === 1}
                      class={css({
                        color: "red.500",
                        bg: "transparent",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "lg",
                        lineHeight: 1,
                        _disabled: { opacity: 0.3, cursor: "not-allowed" },
                        _hover: { color: "red.700" },
                      })}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </Index>
            </div>
          </div>

          <div
            class={css({
              display: "flex",
              gap: "3",
              justifyContent: "flex-end",
              pt: "2",
              borderTop: "1px solid",
              borderColor: "gray.200",
            })}
          >
            <button
              type="button"
              onClick={props.onClose}
              class={css({
                px: "4",
                py: "2",
                border: "1px solid",
                borderColor: "gray.300",
                borderRadius: "md",
                bg: "white",
                cursor: "pointer",
                fontSize: "sm",
                _hover: { bg: "gray.50" },
              })}
            >
              取消
            </button>
            <button type="submit" disabled={submitting()} class={primaryBtn}>
              {submitting() ? "送出中..." : "確認出貨"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Cancel Order Dialog ──────────────────────────────────────────────────────

interface CancelOrderDialogProps {
  orderId: string;
  orderNumber: string;
  onClose: () => void;
  onSuccess: () => void;
}

function CancelOrderDialog(props: CancelOrderDialogProps) {
  const { profile } = useAuth();
  const [cancelledNote, setCancelledNote] = createSignal("");
  const [error, setError] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (!cancelledNote().trim()) {
      setError("請填寫撤銷原因");
      return;
    }
    setError("");
    setSubmitting(true);

    // Fetch order items to reverse stock
    const { data: itemsData, error: itemsErr } = await supabase
      .from("order_items")
      .select("product_id, quantity")
      .eq("order_id", props.orderId);

    if (itemsErr || !itemsData) {
      setError(itemsErr?.message ?? "讀取訂單失敗");
      setSubmitting(false);
      return;
    }

    // Insert reversal stock_movements (type=in)
    const { error: movErr } = await supabase.from("stock_movements").insert(
      itemsData.map((item) => ({
        product_id: item.product_id,
        type: "in" as const,
        quantity: item.quantity,
        note: `撤銷訂單 ${props.orderNumber}：${cancelledNote()}`,
        created_by: profile()!.id,
        order_id: props.orderId,
      }))
    );

    if (movErr) {
      setError(movErr.message);
      setSubmitting(false);
      return;
    }

    // Update order status
    const { error: orderErr } = await supabase
      .from("orders")
      .update({ status: "cancelled", cancelled_note: cancelledNote() })
      .eq("id", props.orderId);

    if (orderErr) {
      setError(orderErr.message);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    props.onSuccess();
    props.onClose();
  };

  return (
    <div class={overlay} onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div
        class={css({
          bg: "white",
          borderRadius: "xl",
          p: "6",
          w: "full",
          maxW: "440px",
          boxShadow: "2xl",
        })}
      >
        <h2 class={css({ fontSize: "lg", fontWeight: "bold", mb: "4" })}>
          撤銷出貨單 {props.orderNumber}
        </h2>

        <p class={css({ fontSize: "sm", color: "gray.600", mb: "4" })}>
          撤銷後將補回對應庫存，此動作無法再次還原。
        </p>

        <Show when={error()}>
          <div
            class={css({
              bg: "red.50",
              border: "1px solid",
              borderColor: "red.200",
              color: "red.700",
              p: "3",
              borderRadius: "md",
              mb: "4",
              fontSize: "sm",
            })}
          >
            {error()}
          </div>
        </Show>

        <form onSubmit={handleSubmit} class={css({ display: "flex", flexDir: "column", gap: "4" })}>
          <div class={fieldGroup}>
            <label class={label}>撤銷原因 *</label>
            <textarea
              required
              value={cancelledNote()}
              onInput={(e) => setCancelledNote(e.currentTarget.value)}
              rows={3}
              class={input}
              placeholder="請說明撤銷原因..."
            />
          </div>

          <div class={css({ display: "flex", gap: "3", justifyContent: "flex-end" })}>
            <button
              type="button"
              onClick={props.onClose}
              class={css({
                px: "4",
                py: "2",
                border: "1px solid",
                borderColor: "gray.300",
                borderRadius: "md",
                bg: "white",
                cursor: "pointer",
                fontSize: "sm",
                _hover: { bg: "gray.50" },
              })}
            >
              返回
            </button>
            <button
              type="submit"
              disabled={submitting()}
              class={css({
                px: "4",
                py: "2",
                bg: "red.600",
                color: "white",
                border: "none",
                borderRadius: "md",
                cursor: "pointer",
                fontSize: "sm",
                fontWeight: "semibold",
                _hover: { bg: "red.700" },
                _disabled: { opacity: 0.5, cursor: "not-allowed" },
              })}
            >
              {submitting() ? "撤銷中..." : "確認撤銷"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Change Status Dialog ─────────────────────────────────────────────────────

interface ChangeStatusDialogProps {
  orderId: string;
  orderNumber: string;
  currentStatus: OrderStatus;
  onClose: () => void;
  onSuccess: () => void;
}

function ChangeStatusDialog(props: ChangeStatusDialogProps) {
  const { profile } = useAuth();
  const [selectedStatus, setSelectedStatus] = createSignal<OrderStatus | null>(null);
  const [cancelledNote, setCancelledNote] = createSignal("");
  const [error, setError] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
  const nextStatuses = () => NEXT_STATUSES[props.currentStatus];

  const handleChange = async (e?: Event) => {
    if (e) e.preventDefault();
    const newStatus = selectedStatus();
    if (!newStatus) return;
    if (newStatus === "cancelled" && !cancelledNote().trim()) {
      setError("請填寫撤銷原因");
      return;
    }
    setError("");
    setSubmitting(true);

    // If cancelling, reverse stock first
    if (newStatus === "cancelled") {
      const { data: itemsData, error: itemsErr } = await supabase
        .from("order_items")
        .select("product_id, quantity")
        .eq("order_id", props.orderId);
      if (itemsErr || !itemsData) {
        setError(itemsErr?.message ?? "讀取訂單失敗");
        setSubmitting(false);
        return;
      }
      const { error: movErr } = await supabase.from("stock_movements").insert(
        itemsData.map((item) => ({
          product_id: item.product_id,
          type: "in" as const,
          quantity: item.quantity,
          note: `撤銷訂單 ${props.orderNumber}：${cancelledNote()}`,
          created_by: profile()!.id,
          order_id: props.orderId,
        }))
      );
      if (movErr) {
        setError(movErr.message);
        setSubmitting(false);
        return;
      }
    }

    const updatePayload: { status: OrderStatus; cancelled_note?: string } = { status: newStatus };
    if (newStatus === "cancelled") updatePayload.cancelled_note = cancelledNote();

    const { error: err } = await supabase
      .from("orders")
      .update(updatePayload)
      .eq("id", props.orderId);
    if (err) {
      setError(err.message);
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    props.onSuccess();
    props.onClose();
  };

  const btnColorMap: Record<string, string> = {
    shipped: "blue.600",
    completed: "purple.600",
    cancelled: "red.600",
  };

  return (
    <div class={overlay} onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class={css({ bg: "white", borderRadius: "xl", p: "6", w: "full", maxW: "400px", boxShadow: "2xl" })}>
        <h2 class={css({ fontSize: "lg", fontWeight: "bold", mb: "1" })}>切換出貨狀態</h2>
        <p class={css({ fontSize: "sm", color: "gray.500", mb: "4" })}>
          {props.orderNumber}　目前：{STATUS_LABEL[props.currentStatus]}
        </p>
        <Show when={error()}>
          <div class={css({ bg: "red.50", border: "1px solid", borderColor: "red.200", color: "red.700", p: "3", borderRadius: "md", mb: "4", fontSize: "sm" })}>
            {error()}
          </div>
        </Show>

        <Show
          when={!selectedStatus()}
          fallback={
            <div class={css({ display: "flex", flexDir: "column", gap: "3" })}>
              <Show when={selectedStatus() === "cancelled"}>
                <div class={fieldGroup}>
                  <label class={label}>撤銷原因 *</label>
                  <textarea
                    required
                    value={cancelledNote()}
                    onInput={(e) => setCancelledNote(e.currentTarget.value)}
                    rows={3}
                    class={input}
                    placeholder="請說明撤銷原因..."
                  />
                </div>
                <p class={css({ fontSize: "xs", color: "gray.500" })}>撤銷後將補回對應庫存。</p>
              </Show>
              <div class={css({ display: "flex", gap: "2" })}>
                <button
                  onClick={() => setSelectedStatus(null)}
                  class={css({ flex: 1, py: "2", border: "1px solid", borderColor: "gray.300", borderRadius: "md", bg: "white", cursor: "pointer", fontSize: "sm", _hover: { bg: "gray.50" } })}
                >
                  返回
                </button>
                <button
                  disabled={submitting()}
                  onClick={handleChange}
                  class={css({
                    flex: 1,
                    py: "2",
                    bg: btnColorMap[selectedStatus()!] ?? "gray.600",
                    color: "white",
                    border: "none",
                    borderRadius: "md",
                    cursor: "pointer",
                    fontSize: "sm",
                    fontWeight: "semibold",
                    _hover: { opacity: 0.85 },
                    _disabled: { opacity: 0.5, cursor: "not-allowed" },
                  })}
                >
                  {submitting() ? "處理中..." : `確認 → ${STATUS_LABEL[selectedStatus()!]}`}
                </button>
              </div>
            </div>
          }
        >
          <div class={css({ display: "flex", flexDir: "column", gap: "2" })}>
            <For each={nextStatuses()}>
              {(s) => (
                <button
                  onClick={() => setSelectedStatus(s)}
                  class={css({
                    py: "2",
                    px: "4",
                    bg: btnColorMap[s] ?? "gray.600",
                    color: "white",
                    border: "none",
                    borderRadius: "md",
                    cursor: "pointer",
                    fontSize: "sm",
                    fontWeight: "semibold",
                    _hover: { opacity: 0.85 },
                  })}
                >
                  → {STATUS_LABEL[s]}
                </button>
              )}
            </For>
          </div>
        </Show>

        <Show when={!selectedStatus()}>
          <button
            onClick={props.onClose}
            class={css({ mt: "3", w: "full", py: "2", border: "1px solid", borderColor: "gray.300", borderRadius: "md", bg: "white", cursor: "pointer", fontSize: "sm", _hover: { bg: "gray.50" } })}
          >
            取消
          </button>
        </Show>
      </div>
    </div>
  );
}

// ─── Orders Page ──────────────────────────────────────────────────────────────

export function OrdersPage() {
  const { profile } = useAuth();
  const [orders, { refetch }] = createResource(fetchOrders);
  const [allProjects] = createResource(fetchAllProjectsForFilter);
  const [allCreators] = createResource(fetchOrderCreators);
  const [showCreate, setShowCreate] = createSignal(false);
  const [cancelDialog, setCancelDialog] = createSignal<{ id: string; orderNumber: string } | null>(null);
  const [statusDialog, setStatusDialog] = createSignal<{ id: string; orderNumber: string; currentStatus: OrderStatus } | null>(null);

  // Filter state (draft bound to inputs, applied on 搜尋)
  const today = new Date().toISOString().slice(0, 10);
  const [draftStatus, setDraftStatus] = createSignal<OrderStatus | "all">("all");
  const [draftDateFrom, setDraftDateFrom] = createSignal("");
  const [draftDateTo, setDraftDateTo] = createSignal("");
  const [draftProjectId, setDraftProjectId] = createSignal("");
  const [draftCreatorId, setDraftCreatorId] = createSignal("");

  const [filterStatus, setFilterStatus] = createSignal<OrderStatus | "all">("all");
  const [filterDateFrom, setFilterDateFrom] = createSignal("");
  const [filterDateTo, setFilterDateTo] = createSignal("");
  const [filterProjectId, setFilterProjectId] = createSignal("");
  const [filterCreatorId, setFilterCreatorId] = createSignal("");

  const applyFilter = () => {
    setFilterStatus(draftStatus());
    setFilterDateFrom(draftDateFrom());
    setFilterDateTo(draftDateTo());
    setFilterProjectId(draftProjectId());
    setFilterCreatorId(draftCreatorId());
  };

  const resetFilter = () => {
    setDraftStatus("all");
    setDraftDateFrom("");
    setDraftDateTo("");
    setDraftProjectId("");
    setDraftCreatorId("");
    setFilterStatus("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterProjectId("");
    setFilterCreatorId("");
  };

  const filteredOrders = createMemo(() => {
    const list = orders() ?? [];
    return list.filter((o) => {
      if (filterStatus() !== "all" && o.status !== filterStatus()) return false;
      if (filterDateFrom()) {
        const orderDate = o.created_at.slice(0, 10);
        if (orderDate < filterDateFrom()) return false;
      }
      if (filterDateTo()) {
        const orderDate = o.created_at.slice(0, 10);
        if (orderDate > filterDateTo()) return false;
      }
      if (filterProjectId()) {
        if (filterProjectId() === "__none__") {
          if (o.project_id !== null) return false;
        } else {
          if (o.project_id !== filterProjectId()) return false;
        }
      }
      if (filterCreatorId()) {
        if (o.profiles?.id !== filterCreatorId()) return false;
      }
      return true;
    });
  });

  const canCreate = () => {
    const role = profile()?.role;
    return role === "admin" || role === "warehouse";
  };

  const canChangeStatus = () => {
    const role = profile()?.role;
    return role === "admin" || role === "warehouse";
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div>
      <div
        class={css({
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: "4",
        })}
      >
        <h1 class={pageTitle}>出貨單</h1>
        <Show when={canCreate()}>
          <button onClick={() => setShowCreate(true)} class={primaryBtn}>
            建立出貨單
          </button>
        </Show>
      </div>

      {/* Filter bar */}
      <div
        class={css({
          bg: "white",
          border: "1px solid",
          borderColor: "gray.200",
          borderRadius: "lg",
          p: "4",
          mb: "4",
          display: "flex",
          flexWrap: "wrap",
          gap: "3",
          alignItems: "flex-end",
        })}
      >
        <div class={css({ display: "flex", flexDir: "column", gap: "1", minW: "120px" })}>
          <label class={css({ fontSize: "xs", color: "gray.500" })}>狀態</label>
          <select
            value={draftStatus()}
            onChange={(e) => setDraftStatus(e.currentTarget.value as OrderStatus | "all")}
            class={input}
          >
            <option value="all">全部</option>
            <option value="active">出貨中</option>
            <option value="shipped">已出貨</option>
            <option value="completed">已完成</option>
            <option value="cancelled">已撤銷</option>
          </select>
        </div>

        <div class={css({ display: "flex", flexDir: "column", gap: "1" })}>
          <label class={css({ fontSize: "xs", color: "gray.500" })}>建立日期（起）</label>
          <input
            type="date"
            value={draftDateFrom()}
            max={today}
            onInput={(e) => setDraftDateFrom(e.currentTarget.value)}
            class={input}
          />
        </div>

        <div class={css({ display: "flex", flexDir: "column", gap: "1" })}>
          <label class={css({ fontSize: "xs", color: "gray.500" })}>建立日期（迄）</label>
          <input
            type="date"
            value={draftDateTo()}
            max={today}
            onInput={(e) => setDraftDateTo(e.currentTarget.value)}
            class={input}
          />
        </div>

        <div class={css({ display: "flex", flexDir: "column", gap: "1", minW: "160px" })}>
          <label class={css({ fontSize: "xs", color: "gray.500" })}>分潤計畫</label>
          <select
            value={draftProjectId()}
            onChange={(e) => setDraftProjectId(e.currentTarget.value)}
            class={input}
          >
            <option value="">全部</option>
            <option value="__none__">無計畫</option>
            <For each={allProjects()}>
              {(p) => <option value={p.id}>{p.name}</option>}
            </For>
          </select>
        </div>

        <div class={css({ display: "flex", flexDir: "column", gap: "1", minW: "140px" })}>
          <label class={css({ fontSize: "xs", color: "gray.500" })}>建立者</label>
          <select
            value={draftCreatorId()}
            onChange={(e) => setDraftCreatorId(e.currentTarget.value)}
            class={input}
          >
            <option value="">全部</option>
            <For each={allCreators()}>
              {(u) => <option value={u.id}>{u.display_name ?? u.email}</option>}
            </For>
          </select>
        </div>

        <div class={css({ display: "flex", gap: "2" })}>
          <button onClick={applyFilter} class={primaryBtn}>搜尋</button>
          <button
            onClick={resetFilter}
            class={css({
              px: "3",
              py: "2",
              border: "1px solid",
              borderColor: "gray.300",
              borderRadius: "md",
              bg: "white",
              cursor: "pointer",
              fontSize: "sm",
              _hover: { bg: "gray.50" },
            })}
          >
            重置
          </button>
        </div>
      </div>

      <Show when={!orders.loading} fallback={<p class={loadingText}>載入中...</p>}>
        <Show
          when={filteredOrders().length > 0}
          fallback={<p class={emptyText}>找不到符合條件的出貨單</p>}
        >
          <div class={css({ display: "flex", flexDir: "column", gap: "4" })}>
            <For each={filteredOrders()}>
              {(order) => {
                const sc = STATUS_COLOR[order.status];
                return (
                  <div
                    class={css({
                      bg: "white",
                      border: "1px solid",
                      borderColor: order.status === "cancelled" ? "red.200" : "gray.200",
                      borderRadius: "lg",
                      p: "4",
                      opacity: order.status === "cancelled" ? 0.7 : 1,
                    })}
                  >
                    <div
                      class={css({
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        mb: "3",
                      })}
                    >
                      <div class={css({ display: "flex", alignItems: "center", gap: "3", flexWrap: "wrap" })}>
                        <span class={css({ fontFamily: "mono", fontWeight: "bold", fontSize: "sm" })}>
                          {order.order_number}
                        </span>
                        <span
                          class={css({
                            px: "2",
                            py: "0.5",
                            borderRadius: "full",
                            fontSize: "xs",
                            fontWeight: "semibold",
                            bg: sc.bg,
                            color: sc.color,
                          })}
                        >
                          {STATUS_LABEL[order.status]}
                        </span>
                        <Show when={order.collaboration_projects}>
                          <span
                            class={css({
                              px: "2",
                              py: "0.5",
                              borderRadius: "full",
                              fontSize: "xs",
                              bg: "blue.100",
                              color: "blue.700",
                            })}
                          >
                            分潤：{order.collaboration_projects!.name}
                          </span>
                        </Show>
                      </div>

                      <div class={css({ display: "flex", alignItems: "center", gap: "2", flexShrink: 0 })}>
                        <span class={css({ fontSize: "xs", color: "gray.400" })}>
                          {formatDate(order.created_at)}
                          {order.profiles
                            ? `　${order.profiles.display_name ?? order.profiles.email}`
                            : ""}
                        </span>
                        <Show when={canChangeStatus() && NEXT_STATUSES[order.status].length > 0}>
                          <button
                            onClick={() =>
                              setStatusDialog({ id: order.id, orderNumber: order.order_number, currentStatus: order.status })
                            }
                            class={css({
                              fontSize: "xs",
                              color: "gray.600",
                              bg: "transparent",
                              border: "1px solid",
                              borderColor: "gray.300",
                              borderRadius: "md",
                              px: "2",
                              py: "1",
                              cursor: "pointer",
                              _hover: { bg: "gray.50" },
                            })}
                          >
                            切換狀態
                          </button>
                        </Show>
                      </div>
                    </div>

                    {/* Items */}
                    <div class={css({ display: "flex", flexWrap: "wrap", gap: "2", mb: "2" })}>
                      <For each={order.order_items}>
                        {(item) => (
                          <span
                            class={css({
                              bg: "gray.100",
                              borderRadius: "md",
                              px: "2",
                              py: "0.5",
                              fontSize: "sm",
                            })}
                          >
                            <Show when={item.products} fallback="—">
                              <span class={css({ fontFamily: "mono", fontSize: "xs", color: "gray.500", mr: "1" })}>
                                [{item.products!.sku}]
                              </span>
                              {item.products!.name} × {item.quantity} {item.products!.unit}
                            </Show>
                          </span>
                        )}
                      </For>
                    </div>

                    <Show when={order.note}>
                      <p class={css({ fontSize: "xs", color: "gray.500" })}>備註：{order.note}</p>
                    </Show>
                    <Show when={order.cancelled_note}>
                      <p class={css({ fontSize: "xs", color: "red.500" })}>撤銷原因：{order.cancelled_note}</p>
                    </Show>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </Show>

      <Show when={showCreate()}>
        <CreateOrderDialog
          onClose={() => setShowCreate(false)}
          onSuccess={() => refetch()}
        />
      </Show>

      <Show when={cancelDialog()}>
        <CancelOrderDialog
          orderId={cancelDialog()!.id}
          orderNumber={cancelDialog()!.orderNumber}
          onClose={() => setCancelDialog(null)}
          onSuccess={() => refetch()}
        />
      </Show>

      <Show when={statusDialog()}>
        <ChangeStatusDialog
          orderId={statusDialog()!.id}
          orderNumber={statusDialog()!.orderNumber}
          currentStatus={statusDialog()!.currentStatus}
          onClose={() => setStatusDialog(null)}
          onSuccess={() => refetch()}
        />
      </Show>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const pageTitle = css({ fontSize: "2xl", fontWeight: "bold", color: "gray.800" });
const loadingText = css({ color: "gray.400", fontSize: "sm" });
const emptyText = css({ color: "gray.400", fontSize: "sm" });
const primaryBtn = css({
  px: "4",
  py: "2",
  bg: "blue.600",
  color: "white",
  border: "none",
  borderRadius: "md",
  cursor: "pointer",
  fontSize: "sm",
  fontWeight: "semibold",
  _hover: { bg: "blue.700" },
  _disabled: { opacity: 0.5, cursor: "not-allowed" },
});
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
const fieldGroup = css({ display: "flex", flexDir: "column", gap: "1" });
const label = css({ fontSize: "sm", fontWeight: "medium", color: "gray.700" });
const input = css({
  w: "full",
  px: "3",
  py: "2",
  border: "1px solid",
  borderColor: "gray.300",
  borderRadius: "md",
  fontSize: "sm",
  bg: "white",
  _focus: { outline: "none", borderColor: "blue.500", ringWidth: "1", ringColor: "blue.500" },
});
