import { createResource, For, Show } from "solid-js";
import { supabase } from "../lib/supabase";
import { css } from "../../styled-system/css";

interface MovementRow {
  id: string;
  type: "in" | "out";
  quantity: number;
  note: string | null;
  created_at: string;
  products: { sku: string; name: string } | null;
  profiles: { display_name: string | null; email: string } | null;
}

async function fetchMovements(): Promise<MovementRow[]> {
  const { data, error } = await supabase
    .from("stock_movements")
    .select("id, type, quantity, note, created_at, products(sku, name), profiles:created_by(display_name, email)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  return (data as unknown as MovementRow[]) ?? [];
}

export function StockHistoryPage() {
  const [movements] = createResource(fetchMovements);

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div>
      <h1 class={pageTitle}>異動紀錄</h1>

      <Show when={!movements.loading} fallback={<p class={loadingText}>載入中...</p>}>
        <Show
          when={movements()?.length}
          fallback={<p class={emptyText}>尚無異動紀錄</p>}
        >
          <div class={css({ overflowX: "auto" })}>
            <table class={table}>
              <thead>
                <tr>
                  <th class={th}>時間</th>
                  <th class={th}>類型</th>
                  <th class={th}>商品</th>
                  <th class={th}>數量</th>
                  <th class={th}>操作人</th>
                  <th class={th}>備註</th>
                </tr>
              </thead>
              <tbody>
                <For each={movements()}>
                  {(m) => (
                    <tr class={css({ _hover: { bg: "gray.50" } })}>
                      <td class={td}>
                        <span class={css({ fontSize: "xs", color: "gray.500" })}>
                          {formatDate(m.created_at)}
                        </span>
                      </td>
                      <td class={td}>
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
                      </td>
                      <td class={td}>
                        <Show when={m.products} fallback="-">
                          <span class={css({ fontFamily: "mono", fontSize: "xs", color: "gray.500" })}>
                            [{m.products!.sku}]
                          </span>{" "}
                          {m.products!.name}
                        </Show>
                      </td>
                      <td class={td}>
                        <span
                          class={css({
                            fontWeight: "semibold",
                            color: m.type === "in" ? "green.600" : "orange.600",
                          })}
                        >
                          {m.type === "in" ? "+" : "-"}{m.quantity}
                        </span>
                      </td>
                      <td class={td}>
                        {m.profiles?.display_name ?? m.profiles?.email ?? "-"}
                      </td>
                      <td class={td}>
                        <span class={css({ color: "gray.500", fontSize: "xs" })}>
                          {m.note ?? "-"}
                        </span>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
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
