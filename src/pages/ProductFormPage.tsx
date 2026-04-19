import { createSignal, createEffect, Show } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { supabase } from "../lib/supabase";
import type { ProductInsert } from "../lib/database.types";
import { css } from "../../styled-system/css";

export function ProductFormPage() {
  const params = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const isEdit = () => Boolean(params.id);

  const [form, setForm] = createSignal<ProductInsert>({
    sku: "",
    name: "",
    description: "",
    category: "",
    unit: "個",
    unit_price: 0,
    quantity: 0,
    min_stock: 0,
    is_active: true,
  });
  const [imageFile, setImageFile] = createSignal<File | null>(null);
  const [error, setError] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
  const [loading, setLoading] = createSignal(false);

  // Load product if editing
  createEffect(async () => {
    if (params.id) {
      setLoading(true);
      const { data, error: err } = await supabase
        .from("products")
        .select("*")
        .eq("id", params.id)
        .single();

      if (err || !data) {
        setError("找不到商品");
        setLoading(false);
        return;
      }
      setForm({
        sku: data.sku,
        name: data.name,
        description: data.description ?? "",
        category: data.category ?? "",
        unit: data.unit,
        unit_price: data.unit_price,
        quantity: data.quantity,
        min_stock: data.min_stock,
        image_url: data.image_url,
        is_active: data.is_active,
      });
      setLoading(false);
    }
  });

  const updateField = <K extends keyof ProductInsert>(
    key: K,
    value: ProductInsert[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    const ext = file.name.split(".").pop();
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from("product-images")
      .upload(fileName, file);

    if (uploadErr) {
      console.error("Upload failed:", uploadErr);
      return null;
    }

    const { data } = supabase.storage
      .from("product-images")
      .getPublicUrl(fileName);
    return data.publicUrl;
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    let imageUrl = form().image_url;

    const file = imageFile();
    if (file) {
      const url = await uploadImage(file);
      if (url) imageUrl = url;
    }

    const payload = { ...form(), image_url: imageUrl || null };

    if (isEdit()) {
      const { error: err } = await supabase
        .from("products")
        .update(payload)
        .eq("id", params.id!);

      if (err) {
        setError(err.message);
        setSubmitting(false);
        return;
      }
    } else {
      const { error: err } = await supabase.from("products").insert(payload);

      if (err) {
        setError(err.message);
        setSubmitting(false);
        return;
      }
    }

    navigate("/products");
  };

  return (
    <div class={css({ maxW: "600px" })}>
      <h1 class={pageTitle}>{isEdit() ? "編輯商品" : "新增商品"}</h1>

      <Show when={loading()}>
        <p class={css({ color: "gray.500" })}>載入中...</p>
      </Show>

      <Show when={error()}>
        <div class={errorBox}>{error()}</div>
      </Show>

      <Show when={!loading()}>
        <form onSubmit={handleSubmit} class={formBody}>
          <div class={row}>
            <div class={fieldGroup}>
              <label class={label}>SKU *</label>
              <input
                type="text"
                required
                value={form().sku}
                onInput={(e) => updateField("sku", e.currentTarget.value)}
                class={input}
                disabled={isEdit()}
              />
            </div>
            <div class={fieldGroup}>
              <label class={label}>名稱 *</label>
              <input
                type="text"
                required
                value={form().name}
                onInput={(e) => updateField("name", e.currentTarget.value)}
                class={input}
              />
            </div>
          </div>

          <div class={fieldGroup}>
            <label class={label}>描述</label>
            <textarea
              value={form().description ?? ""}
              onInput={(e) => updateField("description", e.currentTarget.value)}
              class={css({ ...inputBase, minH: "80px", resize: "vertical" })}
            />
          </div>

          <div class={row}>
            <div class={fieldGroup}>
              <label class={label}>分類</label>
              <input
                type="text"
                value={form().category ?? ""}
                onInput={(e) => updateField("category", e.currentTarget.value)}
                class={input}
                placeholder="例如：電子、食品"
              />
            </div>
            <div class={fieldGroup}>
              <label class={label}>單位</label>
              <input
                type="text"
                value={form().unit ?? "個"}
                onInput={(e) => updateField("unit", e.currentTarget.value)}
                class={input}
              />
            </div>
          </div>

          <div class={row}>
            <div class={fieldGroup}>
              <label class={label}>單價</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form().unit_price}
                onInput={(e) =>
                  updateField("unit_price", parseFloat(e.currentTarget.value) || 0)
                }
                class={input}
              />
            </div>
            <div class={fieldGroup}>
              <label class={label}>安全庫存</label>
              <input
                type="number"
                min="0"
                value={form().min_stock}
                onInput={(e) =>
                  updateField("min_stock", parseInt(e.currentTarget.value) || 0)
                }
                class={input}
              />
            </div>
          </div>

          <Show when={!isEdit()}>
            <div class={fieldGroup}>
              <label class={label}>初始庫存</label>
              <input
                type="number"
                min="0"
                value={form().quantity}
                onInput={(e) =>
                  updateField("quantity", parseInt(e.currentTarget.value) || 0)
                }
                class={input}
              />
            </div>
          </Show>

          <div class={fieldGroup}>
            <label class={label}>商品圖片</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0] ?? null;
                setImageFile(file);
              }}
              class={css({ fontSize: "sm" })}
            />
            <Show when={form().image_url}>
              <img
                src={form().image_url!}
                alt="商品圖片"
                class={css({
                  w: "24",
                  h: "24",
                  borderRadius: "md",
                  objectFit: "cover",
                  mt: "2",
                })}
              />
            </Show>
          </div>

          <div class={css({ display: "flex", alignItems: "center", gap: "2" })}>
            <input
              type="checkbox"
              id="is_active"
              checked={form().is_active}
              onChange={(e) => updateField("is_active", e.currentTarget.checked)}
            />
            <label for="is_active" class={css({ fontSize: "sm", color: "gray.700" })}>
              啟用商品
            </label>
          </div>

          <div class={css({ display: "flex", gap: "3", mt: "2" })}>
            <button type="submit" disabled={submitting()} class={submitBtn}>
              {submitting() ? "儲存中..." : isEdit() ? "更新商品" : "新增商品"}
            </button>
            <button
              type="button"
              onClick={() => navigate("/products")}
              class={cancelBtn}
            >
              取消
            </button>
          </div>
        </form>
      </Show>
    </div>
  );
}

const pageTitle = css({
  fontSize: "xl",
  fontWeight: "bold",
  color: "gray.900",
  mb: "6",
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

const row = css({
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "4",
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

const inputBase = {
  w: "100%",
  px: "3",
  py: "2",
  border: "1px solid",
  borderColor: "gray.300",
  borderRadius: "md",
  fontSize: "sm",
  outline: "none",
} as const;

const input = css({
  ...inputBase,
  _focus: { borderColor: "blue.500", ring: "2px", ringColor: "blue.200" },
  _disabled: { bg: "gray.100", color: "gray.500" },
});

const submitBtn = css({
  px: "6",
  py: "2.5",
  bg: "blue.600",
  color: "white",
  fontWeight: "semibold",
  borderRadius: "md",
  border: "none",
  cursor: "pointer",
  fontSize: "sm",
  _hover: { bg: "blue.700" },
  _disabled: { opacity: 0.6, cursor: "not-allowed" },
});

const cancelBtn = css({
  px: "6",
  py: "2.5",
  bg: "white",
  color: "gray.700",
  fontWeight: "medium",
  borderRadius: "md",
  border: "1px solid",
  borderColor: "gray.300",
  cursor: "pointer",
  fontSize: "sm",
  _hover: { bg: "gray.50" },
});
