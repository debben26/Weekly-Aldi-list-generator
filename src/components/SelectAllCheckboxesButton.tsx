"use client";

import type { ReactNode } from "react";

export default function SelectAllCheckboxesButton({
  formId,
  name,
  checked = true,
  className = "btn-secondary text-xs",
  children = "Select all",
}: {
  formId: string;
  name: string;
  checked?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        const form = document.getElementById(formId);
        if (!form) return;
        form
          .querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="${name}"]`)
          .forEach((checkbox) => {
            checkbox.checked = checked;
          });
      }}
    >
      {children}
    </button>
  );
}
