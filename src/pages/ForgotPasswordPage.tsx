import { createSignal, Show } from "solid-js";
import { A } from "@solidjs/router";
import { supabase } from "../lib/supabase";
import { css } from "../../styled-system/css";

export function ForgotPasswordPage() {
  const [email, setEmail] = createSignal("");
  const [error, setError] = createSignal("");
  const [success, setSuccess] = createSignal(false);
  const [submitting, setSubmitting] = createSignal(false);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const { error: err } = await supabase.auth.resetPasswordForEmail(email(), {
      redirectTo: `${window.location.origin}/set-password`,
    });

    if (err) {
      setError(err.message);
      setSubmitting(false);
    } else {
      setSuccess(true);
      setSubmitting(false);
    }
  };

  return (
    <div class={formWrapper}>
      <div class={formCard}>
        <h1 class={formTitle}>庫存管理系統</h1>
        <p class={formSubtitle}>重設密碼</p>

        <Show when={success()}>
          <div class={successBox}>
            重設密碼的連結已寄出，請檢查您的電子郵件收件箱。
            <br />
            <br />
            <A href="/login" class={css({ color: "green.700", fontWeight: "medium" })}>
              返回登入
            </A>
          </div>
        </Show>

        <Show when={error()}>
          <div class={errorBox}>{error()}</div>
        </Show>

        <Show when={!success()}>
          <form onSubmit={handleSubmit} class={formBody}>
            <div class={fieldGroup}>
              <label class={label} for="email">
                電子郵件
              </label>
              <input
                id="email"
                type="email"
                required
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                class={input}
                placeholder="you@example.com"
              />
            </div>
            <button type="submit" disabled={submitting()} class={submitBtn}>
              {submitting() ? "發送中..." : "發送重設連結"}
            </button>
          </form>
        </Show>

        <p class={css({ textAlign: "center", mt: "4", fontSize: "sm", color: "gray.600" })}>
          <A href="/login" class={css({ color: "blue.600", fontWeight: "medium" })}>
            返回登入
          </A>
        </p>
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
