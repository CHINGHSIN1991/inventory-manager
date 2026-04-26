import { createSignal, Show } from "solid-js";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import type { Product } from "../lib/database.types";
import { css } from "../../styled-system/css";

interface StockDialogProps {
  type: "in" | "out";
  product: Product;
  onClose: () => void;
  onSuccess: () => void;
}

export function StockDialog(props: StockDialogProps) {
  const { profile } = useAuth();
  const [quantity, setQuantity] = createSignal(1);
  const [note, setNote] = createSignal("");
  const [error, setError] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);

  const isOut = () => props.type === "out";
  const title = () => (isOut() ? "出貨" : "進貨");

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError("");

    if (isOut() && quantity() > props.product.quantity) {
      setError(`庫存不足！目前庫存：${props.product.quantity}`);
      return;
    }

    setSubmitting(true);

    const { error: err } = await supabase.from("stock_movements").insert({
      product_id: props.product.id,
      type: props.type,
      quantity: quantity(),
      note: note() || null,
      created_by: profile()!.id,
    });

    setSubmitting(false);

    if (err) {
      setError(err.message);
    } else {
      props.onSuccess();
      props.onClose();
    }
  };

  return (
    <div class={overlay} onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class={dialog}>
        <div class={dialogHeader}>
          <h2 class={dialogTitle}>
            {title()}：{props.product.name}
          </h2>
          <button
            onClick={props.onClose}
            class={css({
              bg: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: "xl",
              color: "gray.500",
              lineHeight: 1,
              _hover: { color: "gray.700" },
            })}
          >
            ✕
          </button>
        </div>

        <Show when={isOut()}>
          <div class={stockInfo}>
            目前庫存：
            <span
              class={css({
                fontWeight: "semibold",
                color: props.product.quantity <= props.product.min_stock ? "red.600" : "blue.600",
              })}
            >
              {props.product.quantity} {props.product.unit}
            </span>
          </div>
        </Show>

        <Show when={error()}>
          <div class={errorBox}>{error()}</div>
        </Show>

        <form onSubmit={handleSubmit} class={css({ display: "flex", flexDir: "column", gap: "4" })}>
          <div class={fieldGroup}>
            <label class={label}>數量 *</label>
            <input
              type="number"
              min="1"
              max={isOut() ? props.product.quantity : undefined}
              required
              value={quantity()}
              onInput={(e) => setQuantity(parseInt(e.currentTarget.value) || 1)}
              class={input}
            />
          </div>

          <div class={fieldGroup}>
            <label class={label}>備註</label>
            <textarea
              value={note()}
              onInput={(e) => setNote(e.currentTarget.value)}
              class={textarea}
              rows={3}
              placeholder={isOut() ? "例如：出貨單號、買家備注" : "例如：供應商名稱、訂單編號"}
            />
          </div>

          <div class={css({ display: "flex", gap: "3", justifyContent: "flex-end" })}>
            <button type="button" onClick={props.onClose} class={cancelBtn}>
              取消
            </button>
            <button
              type="submit"
              disabled={submitting()}
              class={css({
                px: "5",
                py: "2",
                bg: isOut() ? "orange.500" : "blue.600",
                color: "white",
                borderRadius: "md",
                fontSize: "sm",
                fontWeight: "medium",
                border: "none",
                cursor: submitting() ? "default" : "pointer",
                opacity: submitting() ? 0.6 : 1,
                _hover: { bg: isOut() ? "orange.600" : "blue.700" },
              })}
            >
              {submitting() ? "處理中..." : `確認${title()}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const overlay = css({
  position: "fixed",
  inset: 0,
  bg: "blackAlpha.600",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 50,
});

const dialog = css({
  bg: "white",
  borderRadius: "lg",
  shadow: "xl",
  w: "full",
  maxW: "440px",
  p: "6",
  mx: "4",
});

const dialogHeader = css({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  mb: "4",
});

const dialogTitle = css({
  fontSize: "lg",
  fontWeight: "semibold",
  color: "gray.800",
});

const stockInfo = css({
  bg: "blue.50",
  color: "blue.700",
  p: "3",
  borderRadius: "md",
  fontSize: "sm",
  mb: "4",
  border: "1px solid",
  borderColor: "blue.200",
});

const errorBox = css({
  bg: "red.50",
  color: "red.700",
  p: "3",
  borderRadius: "md",
  fontSize: "sm",
  mb: "2",
  border: "1px solid",
  borderColor: "red.200",
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

const textarea = css({
  w: "100%",
  px: "3",
  py: "2",
  border: "1px solid",
  borderColor: "gray.300",
  borderRadius: "md",
  fontSize: "sm",
  outline: "none",
  resize: "vertical",
  _focus: { borderColor: "blue.500", ring: "2px", ringColor: "blue.200" },
});

const cancelBtn = css({
  px: "5",
  py: "2",
  bg: "white",
  color: "gray.700",
  borderRadius: "md",
  fontSize: "sm",
  fontWeight: "medium",
  border: "1px solid",
  borderColor: "gray.300",
  cursor: "pointer",
  _hover: { bg: "gray.50" },
});
