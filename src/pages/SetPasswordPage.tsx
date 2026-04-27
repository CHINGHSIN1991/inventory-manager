import { createSignal, Show } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { css } from "../../styled-system/css";

export function SetPasswordPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = createSignal("");
  const [confirmPassword, setConfirmPassword] = createSignal("");
  const [error, setError] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
  const [done, setDone] = createSignal(false);

  // Detect context from URL hash (set by Supabase when redirecting)
  const pageSubtitle = () => {
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) return "重設密碼";
    if (hash.includes("type=invite") || hash.includes("type=signup")) return "設定您的密碼";
    return "變更密碼";
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (password() !== confirmPassword()) {
      setError("兩次輸入的密碼不相符");
      return;
    }
    setError("");
    setSubmitting(true);

    const { error: err } = await supabase.auth.updateUser({ password: password() });
    if (err) {
      setError(err.message);
      setSubmitting(false);
    } else {
      setDone(true);
      setTimeout(() => navigate("/", { replace: true }), 2000);
    }
  };

  return (
    <div class={formWrapper}>
      <div class={formCard}>
        <h1 class={formTitle}>庫存管理系統</h1>

        <Show
          when={!loading()}
          fallback={
            <p class={css({ textAlign: "center", py: "8", color: "gray.500", fontSize: "sm" })}>
              載入中...
            </p>
          }
        >
          <Show
            when={user()}
            fallback={
              <div>
                <div class={errorBox}>此連結已失效或已過期，請重新申請。</div>
                <p class={css({ textAlign: "center", mt: "4", fontSize: "sm", color: "gray.600" })}>
                  <A href="/forgot-password" class={css({ color: "blue.600", fontWeight: "medium" })}>
                    重新申請重設密碼
                  </A>
                </p>
              </div>
            }
          >
            <Show when={done()}>
              <div class={successBox}>密碼已設定完成！即將跳轉至首頁...</div>
            </Show>

            <Show when={!done()}>
              <p class={formSubtitle}>{pageSubtitle()}</p>

              <Show when={error()}>
                <div class={errorBox}>{error()}</div>
              </Show>

              <form onSubmit={handleSubmit} class={formBody}>
                <div class={fieldGroup}>
                  <label class={label} for="password">
                    新密碼
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    minLength={6}
                    value={password()}
                    onInput={(e) => setPassword(e.currentTarget.value)}
                    class={input}
                    placeholder="至少 6 個字元"
                  />
                </div>
                <div class={fieldGroup}>
                  <label class={label} for="confirmPassword">
                    確認新密碼
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword()}
                    onInput={(e) => setConfirmPassword(e.currentTarget.value)}
                    class={input}
                    placeholder="再次輸入新密碼"
                  />
                </div>
                <button type="submit" disabled={submitting()} class={submitBtn}>
                  {submitting() ? "儲存中..." : "確認設定密碼"}
                </button>
              </form>
            </Show>
          </Show>
        </Show>
      </div>
    </div>
  );
}

const formWrapper = css({
  minH: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  bg: "gray.50",
  p: "4",
});

const formCard = css({
  w: "100%",
  maxW: "400px",
  bg: "white",
  p: "8",
  borderRadius: "xl",
  shadow: "lg",
});

const formTitle = css({
  fontSize: "2xl",
  fontWeight: "bold",
  textAlign: "center",
  color: "gray.900",
  mb: "1",
});

const formSubtitle = css({
  textAlign: "center",
  color: "gray.500",
  fontSize: "sm",
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

const formBody = css({
  display: "flex",
  flexDir: "column",
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

const submitBtn = css({
  w: "100%",
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
