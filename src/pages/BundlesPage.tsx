import { createSignal, createResource, For, Show, Index } from "solid-js";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import type { Product, Bundle, BundleInsert } from "../lib/database.types";
import { css } from "../../styled-system/css";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BundleRow extends Bundle {
  bundle_items: {
    id: string;
    quantity: number;
    products: { id: string; sku: string; name: string; unit: string; quantity: number } | null;
  }[];
}

// ─── Data fetchers ────────────────────────────────────────────────────────────

async function fetchBundles(): Promise<BundleRow[]> {
  const { data, error } = await supabase
    .from("bundles")
    .select("*, bundle_items(id, quantity, products(id, sku, name, unit, quantity))")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as BundleRow[];
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const pageTitle = css({ fontSize: "2xl", fontWeight: "bold", color: "gray.800" });
const loadingText = css({ color: "gray.500", fontSize: "sm" });
const emptyText = css({ color: "gray.400", fontSize: "sm", textAlign: "center", py: "12" });
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
const input = css({
  w: "full",
  px: "3",
  py: "2",
  border: "1px solid",
  borderColor: "gray.300",
  borderRadius: "md",
  fontSize: "sm",
  _focus: { outline: "none", borderColor: "blue.400", boxShadow: "0 0 0 2px token(colors.blue.100)" },
});
const fieldGroup = css({ display: "flex", flexDir: "column", gap: "1" });
const label = css({ fontSize: "sm", fontWeight: "medium", color: "gray.700" });
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

// ─── Bundle Dialog ────────────────────────────────────────────────────────────

interface BundleItem {
  productId: string;
  quantity: number;
}

interface BundleDialogProps {
  bundle?: BundleRow;
  onClose: () => void;
  onSuccess: () => void;
}

function BundleDialog(props: BundleDialogProps) {
  const isEdit = () => !!props.bundle;

  const [sku, setSku] = createSignal(props.bundle?.sku ?? "");
  const [name, setName] = createSignal(props.bundle?.name ?? "");
  const [description, setDescription] = createSignal(props.bundle?.description ?? "");
  const [isActive, setIsActive] = createSignal(props.bundle?.is_active ?? true);
  const [items, setItems] = createSignal<BundleItem[]>(
    props.bundle?.bundle_items.map((bi) => ({ productId: bi.products?.id ?? "", quantity: bi.quantity })) ??
      [{ productId: "", quantity: 1 }]
  );
  const [error, setError] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);

  const [allProducts] = createResource(fetchActiveProducts);

  const addItem = () => setItems((prev) => [...prev, { productId: "", quantity: 1 }]);
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof BundleItem, value: string | number) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError("");

    const validItems = items().filter((i) => i.productId && i.quantity > 0);
    if (validItems.length === 0) {
      setError("請至少新增一項商品");
      return;
    }

    // Check duplicate product
    const ids = validItems.map((i) => i.productId);
    if (new Set(ids).size !== ids.length) {
      setError("商品不可重複");
      return;
    }

    setSubmitting(true);

    if (isEdit()) {
      // Update bundle
      const { error: bundleErr } = await supabase
        .from("bundles")
        .update({ sku: sku(), name: name(), description: description() || null, is_active: isActive() })
        .eq("id", props.bundle!.id);
      if (bundleErr) {
        setError(bundleErr.message);
        setSubmitting(false);
        return;
      }

      // Delete old items and re-insert
      const { error: delErr } = await supabase
        .from("bundle_items")
        .delete()
        .eq("bundle_id", props.bundle!.id);
      if (delErr) {
        setError(delErr.message);
        setSubmitting(false);
        return;
      }

      const { error: itemsErr } = await supabase
        .from("bundle_items")
        .insert(validItems.map((i) => ({ bundle_id: props.bundle!.id, product_id: i.productId, quantity: i.quantity })));
      if (itemsErr) {
        setError(itemsErr.message);
        setSubmitting(false);
        return;
      }
    } else {
      // Insert bundle
      const { data: bundleData, error: bundleErr } = await supabase
        .from("bundles")
        .insert({ sku: sku(), name: name(), description: description() || null, is_active: isActive() } as BundleInsert)
        .select("id")
        .single();
      if (bundleErr || !bundleData) {
        setError(bundleErr?.message ?? "建立組合商品失敗");
        setSubmitting(false);
        return;
      }

      const { error: itemsErr } = await supabase
        .from("bundle_items")
        .insert(validItems.map((i) => ({ bundle_id: bundleData.id, product_id: i.productId, quantity: i.quantity })));
      if (itemsErr) {
        setError(itemsErr.message);
        setSubmitting(false);
        return;
      }
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
          maxW: "600px",
          maxH: "90vh",
          overflowY: "auto",
          boxShadow: "2xl",
        })}
      >
        <div class={css({ display: "flex", justifyContent: "space-between", alignItems: "center", mb: "4" })}>
          <h2 class={css({ fontSize: "lg", fontWeight: "bold" })}>
            {isEdit() ? "編輯組合商品" : "新增組合商品"}
          </h2>
          <button
            onClick={props.onClose}
            class={css({ bg: "transparent", border: "none", cursor: "pointer", fontSize: "xl", color: "gray.500", _hover: { color: "gray.700" } })}
          >
            ✕
          </button>
        </div>

        <Show when={error()}>
          <div class={css({ bg: "red.50", border: "1px solid", borderColor: "red.200", color: "red.700", p: "3", borderRadius: "md", mb: "4", fontSize: "sm" })}>
            {error()}
          </div>
        </Show>

        <form onSubmit={handleSubmit} class={css({ display: "flex", flexDir: "column", gap: "4" })}>
          <div class={css({ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "3" })}>
            <div class={fieldGroup}>
              <label class={label}>SKU *</label>
              <input type="text" required value={sku()} onInput={(e) => setSku(e.currentTarget.value)} class={input} placeholder="BND-001" />
            </div>
            <div class={fieldGroup}>
              <label class={label}>名稱 *</label>
              <input type="text" required value={name()} onInput={(e) => setName(e.currentTarget.value)} class={input} placeholder="組合商品名稱" />
            </div>
          </div>

          <div class={fieldGroup}>
            <label class={label}>描述（選填）</label>
            <input type="text" value={description()} onInput={(e) => setDescription(e.currentTarget.value)} class={input} placeholder="描述說明..." />
          </div>

          <div class={fieldGroup}>
            <label class={css({ fontSize: "sm", fontWeight: "medium", color: "gray.700", display: "flex", alignItems: "center", gap: "2", cursor: "pointer" })}>
              <input type="checkbox" checked={isActive()} onChange={(e) => setIsActive(e.currentTarget.checked)} />
              啟用中
            </label>
          </div>

          {/* Items */}
          <div>
            <div class={css({ display: "flex", justifyContent: "space-between", alignItems: "center", mb: "2" })}>
              <label class={label}>組合內容 *</label>
              <button
                type="button"
                onClick={addItem}
                class={css({ fontSize: "sm", color: "blue.600", bg: "transparent", border: "none", cursor: "pointer", _hover: { textDecoration: "underline" } })}
              >
                + 新增商品
              </button>
            </div>
            <div class={css({ display: "flex", flexDir: "column", gap: "2" })}>
              <Index each={items()}>
                {(item, idx) => (
                  <div class={css({ display: "grid", gridTemplateColumns: "1fr 90px 32px", gap: "2", alignItems: "center" })}>
                    <select
                      value={item().productId}
                      onChange={(e) => updateItem(idx, "productId", e.currentTarget.value)}
                      required
                      class={input}
                    >
                      <option value="">— 選擇商品 —</option>
                      <For each={allProducts()}>
                        {(p) => <option value={p.id}>[{p.sku}] {p.name}</option>}
                      </For>
                    </select>
                    <input
                      type="number"
                      min="1"
                      required
                      value={item().quantity}
                      onInput={(e) => updateItem(idx, "quantity", parseInt(e.currentTarget.value) || 1)}
                      class={input}
                      placeholder="數量"
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      disabled={items().length === 1}
                      class={css({ color: "red.500", bg: "transparent", border: "none", cursor: "pointer", fontSize: "lg", _disabled: { opacity: 0.3, cursor: "not-allowed" }, _hover: { color: "red.700" } })}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </Index>
            </div>
          </div>

          <div class={css({ display: "flex", gap: "3", justifyContent: "flex-end", pt: "2", borderTop: "1px solid", borderColor: "gray.200" })}>
            <button
              type="button"
              onClick={props.onClose}
              class={css({ px: "4", py: "2", border: "1px solid", borderColor: "gray.300", borderRadius: "md", bg: "white", cursor: "pointer", fontSize: "sm", _hover: { bg: "gray.50" } })}
            >
              取消
            </button>
            <button type="submit" disabled={submitting()} class={primaryBtn}>
              {submitting() ? "儲存中..." : isEdit() ? "更新" : "建立"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Dialog ────────────────────────────────────────────────────────────

interface DeleteBundleDialogProps {
  bundle: BundleRow;
  onClose: () => void;
  onSuccess: () => void;
}

function DeleteBundleDialog(props: DeleteBundleDialogProps) {
  const [error, setError] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);

  const handleDelete = async () => {
    setSubmitting(true);
    const { error: err } = await supabase.from("bundles").delete().eq("id", props.bundle.id);
    if (err) {
      setError(err.message);
      setSubmitting(false);
      return;
    }
    props.onSuccess();
    props.onClose();
  };

  return (
    <div class={overlay} onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class={css({ bg: "white", borderRadius: "xl", p: "6", w: "full", maxW: "400px", boxShadow: "2xl" })}>
        <h2 class={css({ fontSize: "lg", fontWeight: "bold", mb: "3" })}>刪除組合商品</h2>
        <p class={css({ fontSize: "sm", color: "gray.600", mb: "4" })}>
          確定要刪除「{props.bundle.name}」？此動作無法復原。
        </p>
        <Show when={error()}>
          <div class={css({ bg: "red.50", border: "1px solid", borderColor: "red.200", color: "red.700", p: "3", borderRadius: "md", mb: "4", fontSize: "sm" })}>
            {error()}
          </div>
        </Show>
        <div class={css({ display: "flex", gap: "3", justifyContent: "flex-end" })}>
          <button
            onClick={props.onClose}
            class={css({ px: "4", py: "2", border: "1px solid", borderColor: "gray.300", borderRadius: "md", bg: "white", cursor: "pointer", fontSize: "sm", _hover: { bg: "gray.50" } })}
          >
            取消
          </button>
          <button
            onClick={handleDelete}
            disabled={submitting()}
            class={css({ px: "4", py: "2", bg: "red.600", color: "white", border: "none", borderRadius: "md", cursor: "pointer", fontSize: "sm", fontWeight: "semibold", _hover: { bg: "red.700" }, _disabled: { opacity: 0.5, cursor: "not-allowed" } })}
          >
            {submitting() ? "刪除中..." : "確認刪除"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function BundlesPage() {
  const { profile } = useAuth();
  const [bundles, { refetch }] = createResource(fetchBundles);
  const [showCreate, setShowCreate] = createSignal(false);
  const [editBundle, setEditBundle] = createSignal<BundleRow | null>(null);
  const [deleteBundle, setDeleteBundle] = createSignal<BundleRow | null>(null);

  const isAdmin = () => profile()?.role === "admin";

  return (
    <div>
      <div class={css({ display: "flex", justifyContent: "space-between", alignItems: "center", mb: "6" })}>
        <h1 class={pageTitle}>組合商品</h1>
        <Show when={isAdmin()}>
          <button onClick={() => setShowCreate(true)} class={primaryBtn}>
            新增組合商品
          </button>
        </Show>
      </div>

      <Show when={!bundles.loading} fallback={<p class={loadingText}>載入中...</p>}>
        <Show when={(bundles()?.length ?? 0) > 0} fallback={<p class={emptyText}>尚無組合商品</p>}>
          <div class={css({ display: "flex", flexDir: "column", gap: "4" })}>
            <For each={bundles()}>
              {(bundle) => (
                <div
                  class={css({
                    bg: "white",
                    border: "1px solid",
                    borderColor: bundle.is_active ? "gray.200" : "gray.100",
                    borderRadius: "lg",
                    p: "4",
                    opacity: bundle.is_active ? 1 : 0.6,
                  })}
                >
                  <div class={css({ display: "flex", justifyContent: "space-between", alignItems: "flex-start" })}>
                    <div>
                      <div class={css({ display: "flex", alignItems: "center", gap: "2", mb: "1" })}>
                        <span class={css({ fontFamily: "mono", fontSize: "sm", color: "gray.500" })}>{bundle.sku}</span>
                        <span class={css({ fontWeight: "bold", fontSize: "md" })}>{bundle.name}</span>
                        <span
                          class={css({
                            px: "2",
                            py: "0.5",
                            borderRadius: "full",
                            fontSize: "xs",
                            fontWeight: "semibold",
                            bg: bundle.is_active ? "green.100" : "gray.100",
                            color: bundle.is_active ? "green.700" : "gray.500",
                          })}
                        >
                          {bundle.is_active ? "啟用" : "停用"}
                        </span>
                      </div>
                      <Show when={bundle.description}>
                        <p class={css({ fontSize: "sm", color: "gray.500", mb: "2" })}>{bundle.description}</p>
                      </Show>
                      <div class={css({ display: "flex", flexWrap: "wrap", gap: "2", mt: "2" })}>
                        <For each={bundle.bundle_items}>
                          {(bi) => (
                            <span
                              class={css({
                                px: "2",
                                py: "1",
                                bg: "blue.50",
                                borderRadius: "md",
                                fontSize: "xs",
                                color: "blue.700",
                              })}
                            >
                              {bi.products?.name ?? bi.products?.sku ?? "—"} × {bi.quantity}
                              <span class={css({ color: "blue.400", ml: "1" })}>(庫存 {bi.products?.quantity ?? 0})</span>
                            </span>
                          )}
                        </For>
                      </div>
                    </div>
                    <Show when={isAdmin()}>
                      <div class={css({ display: "flex", gap: "2", flexShrink: 0 })}>
                        <button
                          onClick={() => setEditBundle(bundle)}
                          class={css({
                            fontSize: "xs",
                            color: "blue.600",
                            bg: "transparent",
                            border: "1px solid",
                            borderColor: "blue.300",
                            borderRadius: "md",
                            px: "2",
                            py: "1",
                            cursor: "pointer",
                            _hover: { bg: "blue.50" },
                          })}
                        >
                          編輯
                        </button>
                        <button
                          onClick={() => setDeleteBundle(bundle)}
                          class={css({
                            fontSize: "xs",
                            color: "red.500",
                            bg: "transparent",
                            border: "1px solid",
                            borderColor: "red.300",
                            borderRadius: "md",
                            px: "2",
                            py: "1",
                            cursor: "pointer",
                            _hover: { bg: "red.50" },
                          })}
                        >
                          刪除
                        </button>
                      </div>
                    </Show>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>

      <Show when={showCreate()}>
        <BundleDialog onClose={() => setShowCreate(false)} onSuccess={() => refetch()} />
      </Show>
      <Show when={editBundle()}>
        <BundleDialog
          bundle={editBundle()!}
          onClose={() => setEditBundle(null)}
          onSuccess={() => refetch()}
        />
      </Show>
      <Show when={deleteBundle()}>
        <DeleteBundleDialog
          bundle={deleteBundle()!}
          onClose={() => setDeleteBundle(null)}
          onSuccess={() => refetch()}
        />
      </Show>
    </div>
  );
}
