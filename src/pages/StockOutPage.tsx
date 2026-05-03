import { createSignal, createResource, For, Show } from "solid-js";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import type { Product } from "../lib/database.types";
import { css } from "../../styled-system/css";

interface ActiveProject {
  id: string;
  name: string;
  partnerName: string;
}

async function fetchActiveProjects(): Promise<ActiveProject[]> {
  const { data, error } = await supabase
    .from("collaboration_projects")
    .select("id, name")
    .eq("status", "active")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    partnerName: "",
  }));
}

async function fetchActiveProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("is_active", true)
    .gt("quantity", 0)
    .order("name");

  if (error) throw error;
  return data ?? [];
}

export function StockOutPage() {
  const { profile } = useAuth();
  const [products, { refetch }] = createResource(fetchActiveProducts);
  const [activeProjects] = createResource(fetchActiveProjects);
  const [productId, setProductId] = createSignal("");
  const [projectId, setProjectId] = createSignal("");
  const [quantity, setQuantity] = createSignal(1);
  const [note, setNote] = createSignal("");
  const [error, setError] = createSignal("");
  const [success, setSuccess] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);

  const selectedProduct = () => products()?.find((p) => p.id === productId());

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!productId()) {
      setError("請選擇商品");
      return;
    }

    const product = selectedProduct();
    if (product && quantity() > product.quantity) {
      setError(`庫存不足！目前庫存：${product.quantity}`);
      return;
    }

    setSubmitting(true);

    const { error: err } = await supabase.from("stock_movements").insert({
      product_id: productId(),
      type: "out" as const,
      quantity: quantity(),
      note: note() || null,
      created_by: profile()!.id,
      project_id: projectId() || null,
    });

    if (err) {
      setError(err.message);
    } else {
      setSuccess(
        `成功出貨：${product?.name ?? "商品"} × ${quantity()}`
      );
      setProductId("");
      setProjectId("");
      setQuantity(1);
      setNote("");
      refetch();
    }
    setSubmitting(false);
  };

  return (
    <div class={css({ maxW: "500px" })}>
      <h1 class={pageTitle}>出貨</h1>

      <Show when={success()}>
        <div class={successBox}>{success()}</div>
      </Show>

      <Show when={error()}>
        <div class={errorBox}>{error()}</div>
      </Show>

      <form onSubmit={handleSubmit} class={formBody}>
        <div class={fieldGroup}>
          <label class={label}>選擇商品 *</label>
          <select
            value={productId()}
            onChange={(e) => setProductId(e.currentTarget.value)}
            class={select}
            required
          >
            <option value="">-- 請選擇商品 --</option>
            <For each={products()}>
              {(product) => (
                <option value={product.id}>
                  [{product.sku}] {product.name}（庫存：{product.quantity}）
                </option>
              )}
            </For>
          </select>
        </div>

        <Show when={selectedProduct()}>
          <div
            class={css({
              bg: "blue.50",
              p: "3",
              borderRadius: "md",
              fontSize: "sm",
              color: "blue.700",
            })}
          >
            目前庫存：{selectedProduct()!.quantity} {selectedProduct()!.unit}
          </div>
        </Show>

        <div class={fieldGroup}>
          <label class={label}>合作專案（選填）</label>
          <select
            value={projectId()}
            onChange={(e) => setProjectId(e.currentTarget.value)}
            class={select}
          >
            <option value="">-- 不指定專案 --</option>
            <For each={activeProjects()}>
              {(proj) => (
                <option value={proj.id}>
                  {proj.partnerName ? `${proj.partnerName} - ` : ""}{proj.name}
                </option>
              )}
            </For>
          </select>
          <Show when={activeProjects.loading}>
            <span class={css({ fontSize: "xs", color: "gray.400" })}>載入中...</span>
          </Show>
          <Show when={activeProjects.error}>
            <span class={css({ fontSize: "xs", color: "red.500" })}>載入專案失敗：{String(activeProjects.error)}</span>
          </Show>
          <Show when={!activeProjects.loading && !activeProjects.error && (activeProjects() ?? []).length === 0}>
            <span class={css({ fontSize: "xs", color: "gray.400" })}>目前無進行中的合作專案</span>
          </Show>
        </div>

        <div class={fieldGroup}>
          <label class={label}>數量 *</label>
          <input
            type="number"
            min="1"
            max={selectedProduct()?.quantity ?? undefined}
            required
            value={quantity()}
            onInput={(e) => setQuantity(parseInt(e.currentTarget.value) || 1)}
            class={input}
          />
        </div>

        <div class={fieldGroup}>
          <label class={label}>備註</label>
          <textarea
            value={note()}
            onInput={(e) => setNote(e.currentTarget.value)}
            class={textarea}
            placeholder="例如：客戶名稱、訂單編號"
          />
        </div>

        <button type="submit" disabled={submitting()} class={submitBtn}>
          {submitting() ? "處理中..." : "確認出貨"}
        </button>
      </form>
    </div>
  );
}

const pageTitle = css({
  fontSize: "xl",
  fontWeight: "bold",
  color: "gray.900",
  mb: "6",
});

const successBox = css({
  bg: "green.50",
  color: "green.700",
  p: "3",
  borderRadius: "md",
  fontSize: "sm",
  mb: "4",
  border: "1px solid",
  borderColor: "green.200",
});

const errorBox = css({
  bg: "red.50",
  color: "red.700",
  p: "3",
  borderRadius: "md",
  fontSize: "sm",
  mb: "4",
  border: "1px solid",
  borderColor: "red.200",
});

const formBody = css({
  display: "flex",
  flexDir: "column",
  gap: "4",
  bg: "white",
  p: "6",
  borderRadius: "lg",
  shadow: "sm",
});

const fieldGroup = css({
  display: "flex",
  flexDir: "column",
  gap: "1",
});

const label = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "gray.700",
});

const input = css({
  w: "100%",
  px: "3",
  py: "2",
  border: "1px solid",
  borderColor: "gray.300",
  borderRadius: "md",
  fontSize: "sm",
  outline: "none",
  _focus: { borderColor: "blue.500", ring: "2px", ringColor: "blue.200" },
});

const select = css({
  w: "100%",
  px: "3",
  py: "2",
  border: "1px solid",
  borderColor: "gray.300",
  borderRadius: "md",
  fontSize: "sm",
  outline: "none",
  bg: "white",
  _focus: { borderColor: "blue.500", ring: "2px", ringColor: "blue.200" },
});

const textarea = css({
  w: "100%",
  px: "3",
  py: "2",
  border: "1px solid",
  borderColor: "gray.300",
  borderRadius: "md",
  fontSize: "sm",
  outline: "none",
  minH: "80px",
  resize: "vertical",
  _focus: { borderColor: "blue.500", ring: "2px", ringColor: "blue.200" },
});

const submitBtn = css({
  w: "100%",
  py: "2.5",
  bg: "orange.600",
  color: "white",
  fontWeight: "semibold",
  borderRadius: "md",
  border: "none",
  cursor: "pointer",
  fontSize: "sm",
  _hover: { bg: "orange.700" },
  _disabled: { opacity: 0.6, cursor: "not-allowed" },
});
