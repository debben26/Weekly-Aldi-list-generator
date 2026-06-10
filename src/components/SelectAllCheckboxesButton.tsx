"use client";

export default function SelectAllCheckboxesButton({
  formId,
  name,
  className = "btn-secondary text-xs",
}: {
  formId: string;
  name: string;
  className?: string;
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
            checkbox.checked = true;
          });
      }}
    >
      Select all
    </button>
  );
}
