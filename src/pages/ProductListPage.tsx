import { createSignal, createResource, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import type { Product } from "../lib/database.types";
import { css } from "../../styled-system/css";
import { StockDialog } from "../components/StockDialog";

async function fetchProducts(search: string): Promise<Product[]> {
  let query = supabase
    .from("products")
    .select("*")
    .order("updated_at", { ascending: false });

  if (search) {
    query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export function ProductListPage() {
  const { profile } = useAuth();
  const [search, setSearch] = createSignal("");
  const [products, { refetch }] = createResource(search, fetchProducts);

  const [stockDialog, setStockDialog] = createSignal<{
    type: "in" | "out";
    product: Product;
  } | null>(null);

  const canEdit = () => {
    const role = profile()?.role;
    return role === "admin" || role === "warehouse";
  };

  const handleDelete = async (id: string) => {
    if (!confirm("確定要刪除此商品？")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) {
      alert("刪除失敗：" + error.message);
    } else {
      refetch();
    }
  };

  return (
    <div>
      <div
        class={css({
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: "6",
        })}
      >
        <h1 class={pageTitle}>商品管理</h1>
        <Show when={canEdit()}>
          <A href="/products/new" class={primaryBtn}>
            新增商品
          </A>
        </Show>
      </div>

      {/* Search */}
      <div class={css({ mb: "4" })}>
        <input
          type="text"
          placeholder="搜尋商品名稱或 SKU..."
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
          class={searchInput}
        />
      </div>

      {/* Product Table */}
      <Show when={!products.loading} fallback={<p class={loadingText}>載入中...</p>}>
        <Show
          when={products()?.length}
          fallback={<p class={emptyText}>沒有找到商品</p>}
        >
          <div class={css({ overflowX: "auto" })}>
            <table class={table}>
              <thead>
                <tr>
                  <th class={th}>SKU</th>
                  <th class={th}>名稱</th>
                  <th class={th}>分類</th>
                  <th class={th}>單位</th>
                  <th class={th}>單價</th>
                  <th class={th}>庫存</th>
                  <th class={th}>安全庫存</th>
                  <th class={th}>狀態</th>
                  <Show when={canEdit()}>
                    <th class={th}>操作</th>
                  </Show>
                </tr>
              </thead>
              <tbody>
                <For each={products()}>
                  {(product) => (
                    <tr class={css({ _hover: { bg: "gray.50" } })}>
                      <td class={td}>
                        <span class={css({ fontFamily: "mono", fontSize: "xs" })}>
                          {product.sku}
                        </span>
                      </td>
                      <td class={td}>
                        <div class={css({ display: "flex", alignItems: "center", gap: "2" })}>
                          <Show when={product.image_url}>
                            <img
                              src={product.image_url!}
                              alt={product.name}
                              class={css({
                                w: "8",
                                h: "8",
                                borderRadius: "md",
                                objectFit: "cover",
                              })}
                            />
                          </Show>
                          {product.name}
                        </div>
                      </td>
                      <td class={td}>{product.category ?? "-"}</td>
                      <td class={td}>{product.unit}</td>
                      <td class={td}>${product.unit_price}</td>
                      <td class={td}>
                        <span
                          class={css({
                            color:
                              product.quantity <= product.min_stock
                                ? "red.600"
                                : "green.600",
                            fontWeight: "semibold",
                          })}
                        >
                          {product.quantity}
                        </span>
                      </td>
                      <td class={td}>{product.min_stock}</td>
                      <td class={td}>
                        <span
                          class={css({
                            px: "2",
                            py: "0.5",
                            borderRadius: "full",
                            fontSize: "xs",
                            fontWeight: "medium",
                            bg: product.is_active ? "green.100" : "gray.100",
                            color: product.is_active ? "green.800" : "gray.600",
                          })}
                        >
                          {product.is_active ? "啟用" : "停用"}
                        </span>
                      </td>
                      <Show when={canEdit()}>
                        <td class={td}>
                          <div class={css({ display: "flex", gap: "2", flexWrap: "wrap" })}>
                            <button
                              onClick={() => setStockDialog({ type: "in", product })}
                              class={css({
                                color: "blue.600",
                                fontSize: "sm",
                                bg: "transparent",
                                border: "none",
                                cursor: "pointer",
                                p: "0",
                                _hover: { textDecoration: "underline" },
                              })}
                            >
                              進貨
                            </button>
                            <button
                              onClick={() => setStockDialog({ type: "out", product })}
                              class={css({
                                color: "orange.600",
                                fontSize: "sm",
                                bg: "transparent",
                                border: "none",
                                cursor: "pointer",
                                p: "0",
                                _hover: { textDecoration: "underline" },
                              })}
                            >
                              出貨
                            </button>
                            <A
                              href={`/products/${product.id}/edit`}
                              class={css({
                                color: "gray.600",
                                fontSize: "sm",
                                _hover: { textDecoration: "underline" },
                              })}
                            >
                              編輯
                            </A>
                            <Show when={profile()?.role === "admin"}>
                              <button
                                onClick={() => handleDelete(product.id)}
                                class={css({
                                  color: "red.600",
                                  fontSize: "sm",
                                  bg: "transparent",
                                  border: "none",
                                  cursor: "pointer",
                                  p: "0",
                                  _hover: { textDecoration: "underline" },
                                })}
                              >
                                刪除
                              </button>
                            </Show>
                          </div>
                        </td>
                      </Show>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </Show>

      <Show when={stockDialog()}>
        {(dialog) => (
          <StockDialog
            type={dialog().type}
            product={dialog().product}
            onClose={() => setStockDialog(null)}
            onSuccess={() => refetch()}
          />
        )}
      </Show>
    </div>
  );
}

const pageTitle = css({
  fontSize: "xl",
  fontWeight: "bold",
  color: "gray.900",
});

const primaryBtn = css({
  px: "4",
  py: "2",
  bg: "blue.600",
  color: "white",
  borderRadius: "md",
  fontSize: "sm",
  fontWeight: "medium",
  textDecoration: "none",
  _hover: { bg: "blue.700" },
});

const searchInput = css({
  w: "100%",
  maxW: "400px",
  px: "3",
  py: "2",
  border: "1px solid",
  borderColor: "gray.300",
  borderRadius: "md",
  fontSize: "sm",
  outline: "none",
  _focus: { borderColor: "blue.500", ring: "2px", ringColor: "blue.200" },
});

const loadingText = css({ color: "gray.500", py: "8", textAlign: "center" });
const emptyText = css({ color: "gray.400", py: "8", textAlign: "center" });

const table = css({
  w: "100%",
  borderCollapse: "collapse",
  bg: "white",
  borderRadius: "lg",
  overflow: "hidden",
  shadow: "sm",
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

const td = css({
  px: "4",
  py: "3",
  borderBottom: "1px solid",
  borderColor: "gray.100",
  color: "gray.700",
});
