"use client";

import type { ReactNode } from "react";

import { Alert } from "./Alert";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  /** Extra detail, rendered inside the dialog body. */
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  destructive?: boolean;
  /** Optional warning shown above the actions. */
  warning?: string;
}

export function ConfirmDialog({
  open,
  title,
  description,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  loading = false,
  destructive = false,
  warning,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={loading ? () => undefined : onCancel}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            onClick={onConfirm}
            loading={loading}
            loadingLabel="Submitting…"
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {body}
        {warning && <Alert tone="warning">{warning}</Alert>}
      </div>
    </Dialog>
  );
}
