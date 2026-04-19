import { createResource, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import type { Product } from "../lib/database.types";
import { css } from "../../styled-system/css";

interface DashboardData {
  totalProducts: number;
  activeProducts: number;
  lowStockProducts: Product[];
  totalValue: number;
  recentMovements: {
    id: string;
    type: "in" | "out";
    quantity: number;
    created_at: string;
    products: { name: string } | null;
  }[];
}

async function fetchDashboard(): Promise<DashboardData> {
  const [productsRes, , movementsRes] = await Promise.all([
    supabase.from("products").select("id, is_active, quantity, unit_price"),
    supabase
      .from("products")
      .select("*")
      .eq("is_active", true)
      .order("quantity")
      .limit(10),
    supabase
      .from("stock_movements")
      .select("id, type, quantity, created_at, products(name)")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const allProducts = productsRes.data ?? [];

  // For low stock, we need to do client-side filtering since lte with column ref may not work directly
  const allActive = (await supabase.from("products").select("*").eq("is_active", true)).data ?? [];
  const lowStock = allActive.filter((p) => p.quantity <= p.min_stock);

  return {
    totalProducts: allProducts.length,
    activeProducts: allProducts.filter((p) => p.is_active).length,
    lowStockProducts: lowStock.slice(0, 10),
    totalValue: allProducts.reduce(
      (sum, p) => sum + (p.quantity ?? 0) * (p.unit_price ?? 0),
      0
    ),
    recentMovements: (movementsRes.data as unknown as DashboardData["recentMovements"]) ?? [],
  };
}

export function DashboardPage() {
  const { profile } = useAuth();
  const [data] = createResource(fetchDashboard);

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("zh-TW", {
      style: "currency",
      currency: "TWD",
      maximumFractionDigits: 0,
    }).format(n);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("zh-TW", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div>
      <h1 class={pageTitle}>
        你好，{profile()?.display_name ?? profile()?.email ?? ""}
      </h1>

      <Show when={data()} fallback={<p class={loadingText}>載入中...</p>}>
        {(d) => (
          <>
            {/* Summary cards */}
            <div class={cardGrid}>
              <div class={card}>
                <p class={cardLabel}>商品總數</p>
                <p class={cardValue}>{d().totalProducts}</p>
              </div>
              <div class={card}>
                <p class={cardLabel}>啟用中</p>
                <p class={cardValue}>{d().activeProducts}</p>
              </div>
              <div class={card}>
                <p class={cardLabel}>庫存總價值</p>
                <p class={cardValue}>{formatCurrency(d().totalValue)}</p>
              </div>
              <div class={css({ ...cardBase, borderColor: d().lowStockProducts.length > 0 ? "red.200" : "gray.200" })}>
                <p class={cardLabel}>低庫存警告</p>
                <p
                  class={css({
                    fontSize: "2xl",
                    fontWeight: "bold",
                    color: d().lowStockProducts.length > 0 ? "red.600" : "green.600",
                  })}
                >
                  {d().lowStockProducts.length}
                </p>
              </div>
            </div>

            {/* Low stock warning */}
            <Show when={d().lowStockProducts.length > 0}>
              <div class={section}>
                <h2 class={sectionTitle}>低庫存商品</h2>
                <div class={css({ overflowX: "auto" })}>
                  <table class={table}>
                    <thead>
                      <tr>
                        <th class={th}>SKU</th>
                        <th class={th}>名稱</th>
                        <th class={th}>目前庫存</th>
                        <th class={th}>安全庫存</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={d().lowStockProducts}>
                        {(product) => (
                          <tr class={css({ _hover: { bg: "gray.50" } })}>
                            <td class={td}>
                              <span class={css({ fontFamily: "mono", fontSize: "xs" })}>
                                {product.sku}
                              </span>
                            </td>
                            <td class={td}>{product.name}</td>
                            <td class={td}>
                              <span class={css({ color: "red.600", fontWeight: "semibold" })}>
                                {product.quantity}
                              </span>
                            </td>
                            <td class={td}>{product.min_stock}</td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </div>
            </Show>

            {/* Recent movements */}
            <div class={section}>
              <div class={css({ display: "flex", justifyContent: "space-between", alignItems: "center", mb: "3" })}>
                <h2 class={sectionTitle}>最近異動</h2>
                <A
                  href="/stock/history"
                  class={css({ fontSize: "sm", color: "blue.600", _hover: { textDecoration: "underline" } })}
                >
                  查看全部
                </A>
              </div>
              <Show
                when={d().recentMovements.length > 0}
                fallback={<p class={emptyText}>尚無異動紀錄</p>}
              >
                <div class={css({ display: "flex", flexDir: "column", gap: "2" })}>
                  <For each={d().recentMovements}>
                    {(m) => (
                      <div
                        class={css({
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          bg: "white",
                          p: "3",
                          borderRadius: "md",
                          shadow: "sm",
                          fontSize: "sm",
                        })}
                      >
                        <div class={css({ display: "flex", alignItems: "center", gap: "2" })}>
                          <span
                            class={css({
                              px: "2",
                              py: "0.5",
                              borderRadius: "full",
                              fontSize: "xs",
                              fontWeight: "semibold",
                              bg: m.type === "in" ? "green.100" : "orange.100",
                              color: m.type === "in" ? "green.800" : "orange.800",
                            })}
                          >
                            {m.type === "in" ? "進貨" : "出貨"}
                          </span>
                          <span>{m.products?.name ?? "未知商品"}</span>
                          <span
                            class={css({
                              fontWeight: "semibold",
                              color: m.type === "in" ? "green.600" : "orange.600",
                            })}
                          >
                            {m.type === "in" ? "+" : "-"}{m.quantity}
                          </span>
                        </div>
                        <span class={css({ color: "gray.400", fontSize: "xs" })}>
                          {formatDate(m.created_at)}
                        </span>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </>
        )}
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

const loadingText = css({ color: "gray.500", py: "8", textAlign: "center" });
const emptyText = css({ color: "gray.400", py: "4", textAlign: "center", fontSize: "sm" });

const cardGrid = css({
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: "4",
  mb: "8",
});

const cardBase = {
  bg: "white",
  p: "5",
  borderRadius: "lg",
  shadow: "sm",
  border: "1px solid",
  borderColor: "gray.200",
} as const;

const card = css(cardBase);

const cardLabel = css({
  fontSize: "sm",
  color: "gray.500",
  mb: "1",
});

const cardValue = css({
  fontSize: "2xl",
  fontWeight: "bold",
  color: "gray.900",
});

const section = css({ mb: "8" });

const sectionTitle = css({
  fontSize: "lg",
  fontWeight: "semibold",
  color: "gray.900",
  mb: "3",
});

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
