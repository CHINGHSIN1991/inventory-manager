import { Show, type ParentProps } from "solid-js";
import { Navigate } from "@solidjs/router";
import { useAuth } from "../contexts/AuthContext";
import { css } from "../../styled-system/css";

export function AuthGuard(props: ParentProps) {
  const { user, loading } = useAuth();

  return (
    <Show
      when={!loading()}
      fallback={
        <div
          class={css({
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minH: "100vh",
            fontSize: "lg",
            color: "gray.500",
          })}
        >
          載入中...
        </div>
      }
    >
      <Show when={user()} fallback={<Navigate href="/login" />}>
        {props.children}
      </Show>
    </Show>
  );
}
