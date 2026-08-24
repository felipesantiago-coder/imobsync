"use client";

import { X } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "default";
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

const variantStyles = {
  danger: {
    button:
      "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500",
    icon: "bg-red-100 text-red-600",
  },
  warning: {
    button:
      "bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-500",
    icon: "bg-amber-100 text-amber-600",
  },
  default: {
    button:
      "bg-[#0D1B2A] text-white hover:bg-gray-800 focus:ring-[#0D1B2A]",
    icon: "bg-slate-100 text-slate-600",
  },
};

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "default",
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDialogProps) {
  if (!open) return null;
  const styles = variantStyles[variant];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={loading ? undefined : onCancel}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in fade-in-0 zoom-in-95 duration-200">
        <button
          onClick={onCancel}
          disabled={loading}
          className="absolute top-4 right-4 p-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-400"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-start gap-4">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${styles.icon}`}
          >
            <AlertTriangleIcon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-gray-900 mb-1">{title}</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              {description}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-all disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 shadow-md ${styles.button}`}
          >
            {loading ? (
              <span className="inline-flex items-center gap-1.5">
                <LoadingSpinner className="w-3.5 h-3.5" />
                Aguarde...
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function AlertTriangleIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
