import { createSignal, createResource, createMemo, For, Show } from "solid-js";
import { SolidApexCharts } from "solid-apexcharts";
import { supabase } from "../lib/supabase";
import { css } from "../../styled-system/css";

// ─── Types ───────────────────────────────────────────────────────────────────

interface OrderItemRow {
  quantity: number;
  products: { name: string; sku: string; unit_price: number } | null;
}

interface OrderRow {
  id: string;
  status: string;
  created_at: string;
  order_items: OrderItemRow[];
}

interface MonthStats {
  orderCount: number;
  totalQty: number;
  totalRevenue: number;
  topProducts: { name: string; sku: string; qty: number; revenue: number }[];
}

// ─── Data fetcher ─────────────────────────────────────────────────────────────

async function fetchOrdersForPeriod(
  startDate: string,
  endDate: string
): Promise<OrderRow[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, status, created_at, order_items(quantity, products(name, sku, unit_price))"
    )
    .in("status", ["shipped", "completed"])
    .gte("created_at", startDate)
    .lt("created_at", endDate)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as OrderRow[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeStats(orders: OrderRow[]): MonthStats {
  const productMap = new Map<
    string,
    { name: string; sku: string; qty: number; revenue: number }
  >();

  let totalQty = 0;
  let totalRevenue = 0;

  for (const order of orders) {
    for (const item of order.order_items) {
      const qty = item.quantity;
      const price = item.products?.unit_price ?? 0;
      const name = item.products?.name ?? "未知商品";
      const sku = item.products?.sku ?? "";
      totalQty += qty;
      totalRevenue += qty * price;
      const existing = productMap.get(sku);
      if (existing) {
        existing.qty += qty;
        existing.revenue += qty * price;
      } else {
        productMap.set(sku, { name, sku, qty, revenue: qty * price });
      }
    }
  }

  const topProducts = [...productMap.values()]
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);

  return { orderCount: orders.length, totalQty, totalRevenue, topProducts };
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(n);
}

function monthLabel(year: number, month: number) {
  return `${year}年${String(month).padStart(2, "0")}月`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SalesPage() {
  const now = new Date();
  const [viewMode, setViewMode] = createSignal<"month" | "year">("month");
  const [year, setYear] = createSignal(now.getFullYear());
  const [month, setMonth] = createSignal(now.getMonth() + 1);
  const [chartMetric, setChartMetric] = createSignal<"revenue" | "qty">(
    "revenue"
  );

  // ── Month mode: only fetch when in month mode ──
  const monthKey = createMemo(() =>
    viewMode() === "month"
      ? `${year()}-${String(month()).padStart(2, "0")}`
      : undefined
  );

  const [monthOrders] = createResource(monthKey, async (key) => {
    const [y, m] = key.split("-").map(Number);
    const start = new Date(y, m - 1, 1).toISOString();
    const end = new Date(y, m, 1).toISOString();
    return fetchOrdersForPeriod(start, end);
  });

  const monthStats = createMemo(() =>
    computeStats(monthOrders() ?? [])
  );

  // ── Year mode: only fetch when in year mode ──
  const yearKey = createMemo(() =>
    viewMode() === "year" ? year() : undefined
  );

  const [yearOrders] = createResource(yearKey, async (y) => {
    const start = new Date(y, 0, 1).toISOString();
    const end = new Date(y + 1, 0, 1).toISOString();
    return fetchOrdersForPeriod(start, end);
  });

  // Split year orders by month
  const yearMonthlyStats = createMemo(() => {
    const orders = yearOrders();
    if (!orders) return null;
    const byMonth: MonthStats[] = [];
    for (let m = 1; m <= 12; m++) {
      const start = new Date(year(), m - 1, 1);
      const end = new Date(year(), m, 1);
      const filtered = orders.filter((o) => {
        const d = new Date(o.created_at);
        return d >= start && d < end;
      });
      byMonth.push(computeStats(filtered));
    }
    return byMonth;
  });

  const yearTotalStats = createMemo(() => {
    const monthly = yearMonthlyStats();
    if (!monthly) return null;
    return monthly.reduce(
      (acc, m) => ({
        orderCount: acc.orderCount + m.orderCount,
        totalQty: acc.totalQty + m.totalQty,
        totalRevenue: acc.totalRevenue + m.totalRevenue,
        topProducts: [],
      }),
      { orderCount: 0, totalQty: 0, totalRevenue: 0, topProducts: [] }
    );
  });

  // ── Navigation ──
  const prevMonth = () => {
    if (month() === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };
  const nextMonth = () => {
    if (month() === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  // ── Chart options ──
  const chartSeries = createMemo(() => {
    const monthly = yearMonthlyStats();
    if (!monthly) return [];
    const metric = chartMetric();
    return [
      {
        name: metric === "revenue" ? "銷售金額" : "出貨量",
        data: monthly.map((m) =>
          metric === "revenue"
            ? Math.round(m.totalRevenue)
            : m.totalQty
        ),
      },
    ];
  });

  const chartOptions = createMemo(() => ({
    chart: { type: "bar" as const, toolbar: { show: false }, fontFamily: "inherit" },
    xaxis: {
      categories: ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"],
      labels: { style: { fontSize: "12px" } },
    },
    yaxis: {
      labels: {
        formatter: (val: number) =>
          chartMetric() === "revenue"
            ? `NT$${val.toLocaleString()}`
            : `${val}`,
      },
    },
    tooltip: {
      y: {
        formatter: (val: number) =>
          chartMetric() === "revenue"
            ? formatCurrency(val)
            : `${val} 件`,
      },
    },
    colors: ["#3b82f6"],
    plotOptions: { bar: { borderRadius: 4 } },
    dataLabels: { enabled: false },
  }));

  // ── Styles ──
  const pageTitle = css({
    fontSize: "2xl",
    fontWeight: "bold",
    mb: "6",
    color: "gray.800",
  });

  const card = css({
    bg: "white",
    borderRadius: "lg",
    border: "1px solid",
    borderColor: "gray.200",
    p: "5",
    shadow: "sm",
  });

  const statLabel = css({ fontSize: "sm", color: "gray.500", mb: "1" });
  const statValue = css({ fontSize: "2xl", fontWeight: "bold", color: "gray.900" });

  const tabBtn = (active: boolean) =>
    css({
      px: "4",
      py: "2",
      borderRadius: "md",
      fontSize: "sm",
      fontWeight: "medium",
      cursor: "pointer",
      border: "1px solid",
      transition: "all 0.15s",
      bg: active ? "blue.600" : "white",
      color: active ? "white" : "gray.600",
      borderColor: active ? "blue.600" : "gray.300",
      _hover: active ? {} : { bg: "gray.50" },
    });

  const arrowBtn = css({
    w: "8",
    h: "8",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "md",
    border: "1px solid",
    borderColor: "gray.300",
    bg: "white",
    cursor: "pointer",
    fontSize: "lg",
    _hover: { bg: "gray.50" },
  });

  return (
    <div class={css({ p: "6", maxW: "1200px" })}>
      <h1 class={pageTitle}>銷售統計</h1>

      {/* ── 模式切換 ── */}
      <div class={css({ display: "flex", gap: "2", mb: "6" })}>
        <button
          class={tabBtn(viewMode() === "month")}
          onClick={() => setViewMode("month")}
        >
          月份模式
        </button>
        <button
          class={tabBtn(viewMode() === "year")}
          onClick={() => setViewMode("year")}
        >
          年度模式
        </button>
      </div>

      {/* ── 月份模式 ── */}
      <Show when={viewMode() === "month"}>
        {/* 月份選擇器 */}
        <div
          class={css({
            display: "flex",
            alignItems: "center",
            gap: "4",
            mb: "6",
          })}
        >
          <button class={arrowBtn} onClick={prevMonth}>
            ‹
          </button>
          <span
            class={css({ fontSize: "xl", fontWeight: "semibold", minW: "140px", textAlign: "center" })}
          >
            {monthLabel(year(), month())}
          </span>
          <button class={arrowBtn} onClick={nextMonth}>
            ›
          </button>
        </div>

        {/* 統計卡片 */}
        <Show when={monthOrders.error}>
          <p class={css({ color: "red.600", mb: "4", fontSize: "sm" })}>
            載入失敗：{String(monthOrders.error)}
          </p>
        </Show>
        <Show
          when={!monthOrders.loading}
          fallback={
            <p class={css({ color: "gray.500" })}>載入中…</p>
          }
        >
          <div
            class={css({
              display: "grid",
              gridTemplateColumns: { base: "1fr", md: "repeat(3, 1fr)" },
              gap: "4",
              mb: "6",
            })}
          >
            <div class={card}>
              <p class={statLabel}>訂單筆數</p>
              <p class={statValue}>{monthStats().orderCount}</p>
            </div>
            <div class={card}>
              <p class={statLabel}>出貨總量</p>
              <p class={statValue}>{monthStats().totalQty.toLocaleString()} 件</p>
            </div>
            <div class={card}>
              <p class={statLabel}>銷售金額</p>
              <p class={statValue}>{formatCurrency(monthStats().totalRevenue)}</p>
            </div>
          </div>

          {/* 品項排行 */}
          <div class={card}>
            <h2 class={css({ fontSize: "lg", fontWeight: "semibold", mb: "4", color: "gray.800" })}>
              品項銷售排行 Top 10
            </h2>
            <Show
              when={monthStats().topProducts.length > 0}
              fallback={
                <p class={css({ color: "gray.400", textAlign: "center", py: "8" })}>
                  本月尚無銷售資料
                </p>
              }
            >
              <div class={css({ overflowX: "auto" })}>
                <table class={css({ w: "100%", fontSize: "sm" })}>
                  <thead>
                    <tr
                      class={css({
                        borderBottom: "2px solid",
                        borderColor: "gray.200",
                        "& th": {
                          py: "2",
                          px: "3",
                          textAlign: "left",
                          fontWeight: "semibold",
                          color: "gray.600",
                        },
                      })}
                    >
                      <th>#</th>
                      <th>SKU</th>
                      <th>商品名稱</th>
                      <th class={css({ textAlign: "right" })}>出貨量</th>
                      <th class={css({ textAlign: "right" })}>銷售金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={monthStats().topProducts}>
                      {(p, i) => (
                        <tr
                          class={css({
                            borderBottom: "1px solid",
                            borderColor: "gray.100",
                            _hover: { bg: "gray.50" },
                            "& td": { py: "2", px: "3" },
                          })}
                        >
                          <td class={css({ color: "gray.400", fontWeight: "medium" })}>
                            {i() + 1}
                          </td>
                          <td class={css({ fontFamily: "mono", color: "gray.600", fontSize: "xs" })}>
                            {p.sku}
                          </td>
                          <td>{p.name}</td>
                          <td class={css({ textAlign: "right", fontWeight: "medium" })}>
                            {p.qty.toLocaleString()}
                          </td>
                          <td class={css({ textAlign: "right", color: "blue.700", fontWeight: "medium" })}>
                            {formatCurrency(p.revenue)}
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>
          </div>
        </Show>
      </Show>

      {/* ── 年度模式 ── */}
      <Show when={viewMode() === "year"}>
        {/* 年份選擇器 */}
        <div
          class={css({
            display: "flex",
            alignItems: "center",
            gap: "4",
            mb: "6",
          })}
        >
          <button class={arrowBtn} onClick={() => setYear((y) => y - 1)}>
            ‹
          </button>
          <span class={css({ fontSize: "xl", fontWeight: "semibold", minW: "100px", textAlign: "center" })}>
            {year()} 年
          </span>
          <button class={arrowBtn} onClick={() => setYear((y) => y + 1)}>
            ›
          </button>
        </div>

        <Show
          when={!yearOrders.loading}
          fallback={<p class={css({ color: "gray.500" })}>載入中…</p>}
        >
          {/* 全年合計卡片 */}
          <Show when={yearTotalStats()}>
            <div
              class={css({
                display: "grid",
                gridTemplateColumns: { base: "1fr", md: "repeat(3, 1fr)" },
                gap: "4",
                mb: "6",
              })}
            >
              <div class={card}>
                <p class={statLabel}>全年訂單筆數</p>
                <p class={statValue}>{yearTotalStats()!.orderCount}</p>
              </div>
              <div class={card}>
                <p class={statLabel}>全年出貨總量</p>
                <p class={statValue}>{yearTotalStats()!.totalQty.toLocaleString()} 件</p>
              </div>
              <div class={card}>
                <p class={statLabel}>全年銷售金額</p>
                <p class={statValue}>{formatCurrency(yearTotalStats()!.totalRevenue)}</p>
              </div>
            </div>
          </Show>

          {/* 趨勢圖 */}
          <div class={css({ bg: "white", borderRadius: "lg", border: "1px solid", borderColor: "gray.200", p: "5", shadow: "sm", mb: "6" })}>
            <div
              class={css({
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: "4",
              })}
            >
              <h2 class={css({ fontSize: "lg", fontWeight: "semibold", color: "gray.800" })}>
                月度趨勢
              </h2>
              <div class={css({ display: "flex", gap: "2" })}>
                <button
                  class={tabBtn(chartMetric() === "revenue")}
                  onClick={() => setChartMetric("revenue")}
                >
                  銷售金額
                </button>
                <button
                  class={tabBtn(chartMetric() === "qty")}
                  onClick={() => setChartMetric("qty")}
                >
                  出貨量
                </button>
              </div>
            </div>
            <Show when={yearMonthlyStats()}>
              <SolidApexCharts
                type="bar"
                height={300}
                series={chartSeries()}
                options={chartOptions()}
              />
            </Show>
          </div>

          {/* 全年品項排行 */}
          <Show when={yearOrders()}>
            {(orders) => {
              const stats = computeStats(orders());
              return (
                <div class={card}>
                  <h2
                    class={css({
                      fontSize: "lg",
                      fontWeight: "semibold",
                      mb: "4",
                      color: "gray.800",
                    })}
                  >
                    品項銷售排行 Top 10（全年）
                  </h2>
                  <Show
                    when={stats.topProducts.length > 0}
                    fallback={
                      <p
                        class={css({
                          color: "gray.400",
                          textAlign: "center",
                          py: "8",
                        })}
                      >
                        本年度尚無銷售資料
                      </p>
                    }
                  >
                    <div class={css({ overflowX: "auto" })}>
                      <table class={css({ w: "100%", fontSize: "sm" })}>
                        <thead>
                          <tr
                            class={css({
                              borderBottom: "2px solid",
                              borderColor: "gray.200",
                              "& th": {
                                py: "2",
                                px: "3",
                                textAlign: "left",
                                fontWeight: "semibold",
                                color: "gray.600",
                              },
                            })}
                          >
                            <th>#</th>
                            <th>SKU</th>
                            <th>商品名稱</th>
                            <th class={css({ textAlign: "right" })}>出貨量</th>
                            <th class={css({ textAlign: "right" })}>銷售金額</th>
                          </tr>
                        </thead>
                        <tbody>
                          <For each={stats.topProducts}>
                            {(p, i) => (
                              <tr
                                class={css({
                                  borderBottom: "1px solid",
                                  borderColor: "gray.100",
                                  _hover: { bg: "gray.50" },
                                  "& td": { py: "2", px: "3" },
                                })}
                              >
                                <td
                                  class={css({
                                    color: "gray.400",
                                    fontWeight: "medium",
                                  })}
                                >
                                  {i() + 1}
                                </td>
                                <td
                                  class={css({
                                    fontFamily: "mono",
                                    color: "gray.600",
                                    fontSize: "xs",
                                  })}
                                >
                                  {p.sku}
                                </td>
                                <td>{p.name}</td>
                                <td
                                  class={css({
                                    textAlign: "right",
                                    fontWeight: "medium",
                                  })}
                                >
                                  {p.qty.toLocaleString()}
                                </td>
                                <td
                                  class={css({
                                    textAlign: "right",
                                    color: "blue.700",
                                    fontWeight: "medium",
                                  })}
                                >
                                  {formatCurrency(p.revenue)}
                                </td>
                              </tr>
                            )}
                          </For>
                        </tbody>
                      </table>
                    </div>
                  </Show>
                </div>
              );
            }}
          </Show>
        </Show>
      </Show>
    </div>
  );
}
