"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { importReceipt } from "@/app/receipts/import";

// Thin "use server" wrapper over the testable importReceipt core (see import.ts).
// Accepts a .json file upload OR pasted text. Reconciliation warnings come back as a confirmation
// step (pendingJson is echoed so the user can proceed without re-pasting).
export type ImportFormState = {
  error?: string;
  warnings?: string[];
  pendingJson?: string;
};

export async function importReceiptAction(
  _prev: ImportFormState,
  formData: FormData,
): Promise<ImportFormState> {
  const file = formData.get("file");
  const pasted = String(formData.get("json") ?? "");
  const acknowledgeWarnings = String(formData.get("acknowledgeWarnings") ?? "") === "true";

  let jsonText = pasted.trim();
  if (file instanceof File && file.size > 0) {
    jsonText = (await file.text()).trim();
  }
  if (!jsonText) {
    return { error: "Choose a .json file or paste the JSON the chat produced." };
  }

  const result = await importReceipt(jsonText, { acknowledgeWarnings });

  switch (result.status) {
    case "error":
    case "duplicate":
      return { error: result.error };
    case "needs_confirmation":
      return { warnings: result.warnings, pendingJson: jsonText };
    case "imported":
      revalidatePath("/receipts");
      redirect("/receipts");
  }
}
