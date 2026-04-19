import { createSignal, Show } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { useAuth } from "../contexts/AuthContext";
import { css } from "../../styled-system/css";

export function LoginPage() {
  const { signIn, user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);

  // Redirect if already logged in
  if (!loading() && user()) {
    navigate("/", { replace: true });
  }

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const { error: err } = await signIn(email(), password());
    if (err) {
      setError(err);
      setSubmitting(false);
    } else {
      navigate("/", { replace: true });
    }
  };

  return (
    <div class={formWrapper}>
      <div class={formCard}>
        <h1 class={formTitle}>庫存管理系統</h1>
        <p class={formSubtitle}>登入您的帳號</p>

        <Show when={error()}>
          <div class={errorBox}>{error()}</div>
        </Show>

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
          <div class={fieldGroup}>
            <label class={label} for="password">
              密碼
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
          <button type="submit" disabled={submitting()} class={submitBtn}>
            {submitting() ? "登入中..." : "登入"}
          </button>
        </form>

        <p class={css({ textAlign: "center", mt: "4", fontSize: "sm", color: "gray.600" })}>
          還沒有帳號？{" "}
          <A href="/register" class={css({ color: "blue.600", fontWeight: "medium" })}>
            註冊
          </A>
        </p>
      </div>
    </div>
  );
}

// Shared styles
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
