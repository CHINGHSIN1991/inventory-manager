import { Show, type ParentProps } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { useAuth } from "../contexts/AuthContext";
import { css } from "../../styled-system/css";

export function AppLayout(props: ParentProps) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const roleLabel = () => {
    const r = profile()?.role;
    if (r === "admin") return "管理員";
    if (r === "warehouse") return "倉管";
    return "檢視者";
  };

  return (
    <div class={css({ minH: "100vh", display: "flex" })}>
      {/* Sidebar */}
      <aside
        class={css({
          w: "240px",
          bg: "gray.900",
          color: "white",
          p: "4",
          display: "flex",
          flexDir: "column",
          gap: "2",
          flexShrink: 0,
        })}
      >
        <h1
          class={css({
            fontSize: "xl",
            fontWeight: "bold",
            mb: "4",
            pb: "4",
            borderBottom: "1px solid",
            borderColor: "gray.700",
          })}
        >
          庫存管理系統
        </h1>
        <nav class={css({ display: "flex", flexDir: "column", gap: "1", flex: 1 })}>
          <NavLink href="/">首頁總覽</NavLink>
          <NavLink href="/products">商品管理</NavLink>
          <NavLink href="/stock/in">進貨</NavLink>
          <NavLink href="/stock/out">出貨</NavLink>
          <NavLink href="/stock/history">異動紀錄</NavLink>
        </nav>
        <div
          class={css({
            pt: "4",
            borderTop: "1px solid",
            borderColor: "gray.700",
            fontSize: "sm",
          })}
        >
          <Show when={profile()}>
            <p class={css({ mb: "1" })}>{profile()!.display_name ?? profile()!.email}</p>
            <p class={css({ color: "gray.400", mb: "3", fontSize: "xs" })}>
              {roleLabel()}
            </p>
          </Show>
          <button
            onClick={handleSignOut}
            class={css({
              w: "100%",
              py: "2",
              px: "3",
              bg: "gray.800",
              color: "gray.300",
              borderRadius: "md",
              cursor: "pointer",
              fontSize: "sm",
              _hover: { bg: "gray.700", color: "white" },
            })}
          >
            登出
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main class={css({ flex: 1, p: "6", bg: "gray.50", overflow: "auto" })}>
        {props.children}
      </main>
    </div>
  );
}

function NavLink(props: { href: string; children: string }) {
  return (
    <A
      href={props.href}
      end={props.href === "/"}
      class={css({
        py: "2",
        px: "3",
        borderRadius: "md",
        fontSize: "sm",
        color: "gray.300",
        textDecoration: "none",
        _hover: { bg: "gray.800", color: "white" },
      })}
      activeClass={css({ bg: "gray.800", color: "white", fontWeight: "semibold" })}
    >
      {props.children}
    </A>
  );
}
