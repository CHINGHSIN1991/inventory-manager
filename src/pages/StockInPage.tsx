import { createSignal, createResource, For, Show } from "solid-js";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import type { Product } from "../lib/database.types";
import { css } from "../../styled-system/css";

async function fetchActiveProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("is_active", true)
    .order("name");

  if (error) throw error;
  return data ?? [];
}

export function StockInPage() {
  const { profile } = useAuth();
  const [products] = createResource(fetchActiveProducts);
  const [productId, setProductId] = createSignal("");
  const [quantity, setQuantity] = createSignal(1);
  const [note, setNote] = createSignal("");
  const [error, setError] = createSignal("");
  const [success, setSuccess] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!productId()) {
      setError("請選擇商品");
      return;
    }

    setSubmitting(true);

    const { error: err } = await supabase.from("stock_movements").insert({
      product_id: productId(),
      type: "in" as const,
      quantity: quantity(),
      note: note() || null,
      created_by: profile()!.id,
    });

    if (err) {
      setError(err.message);
    } else {
      const product = products()?.find((p) => p.id === productId());
      setSuccess(
        `成功進貨：${product?.name ?? "商品"} × ${quantity()}`
      );
      setProductId("");
      setQuantity(1);
      setNote("");
    }
    setSubmitting(false);
  };

  return (
    <div class={css({ maxW: "500px" })}>
      <h1 class={pageTitle}>進貨</h1>

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
                  [{product.sku}] {product.name}（目前庫存：{product.quantity}）
                </option>
              )}
            </For>
          </select>
        </div>

        <div class={fieldGroup}>
          <label class={label}>數量 *</label>
          <input
            type="number"
            min="1"
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
            placeholder="例如：供應商名稱、訂單編號"
          />
        </div>

        <button type="submit" disabled={submitting()} class={submitBtn}>
          {submitting() ? "處理中..." : "確認進貨"}
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
  bg: "green.600",
  color: "white",
  fontWeight: "semibold",
  borderRadius: "md",
  border: "none",
  cursor: "pointer",
  fontSize: "sm",
  _hover: { bg: "green.700" },
  _disabled: { opacity: 0.6, cursor: "not-allowed" },
});
