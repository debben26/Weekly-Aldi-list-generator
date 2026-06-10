import SubmitButton from "@/components/SubmitButton";

type ItemOption = { id: string; canonicalName: string };
type SectionOption = { id: string; name: string };

export default function ManualListItemForm({
  action,
  listId,
  planId,
  step,
  items,
  sections,
}: {
  action: (formData: FormData) => Promise<void>;
  listId: string;
  planId?: string;
  step?: string;
  items: ItemOption[];
  sections: SectionOption[];
}) {
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="listId" value={listId} />
      {planId ? <input type="hidden" name="planId" value={planId} /> : null}
      {step ? <input type="hidden" name="step" value={step} /> : null}
      <L label="Item">
        <select name="itemId" className="input w-48" defaultValue="">
          <option value="">-- select --</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.canonicalName}
            </option>
          ))}
        </select>
      </L>
      <L label="or new item">
        <input name="newItemName" className="input w-48" placeholder="adds to catalog" />
      </L>
      <L label="Qty">
        <input name="quantity" type="number" step="any" className="input w-20" />
      </L>
      <L label="Unit">
        <input name="unit" className="input w-24" placeholder="item default" />
      </L>
      <L label="Section">
        <select name="sectionId" className="input w-40" defaultValue="">
          <option value="">-- item default --</option>
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.name}
            </option>
          ))}
        </select>
      </L>
      <SubmitButton
        pendingChildren="Adding..."
        className="rounded bg-aldi-navy px-3 py-1.5 text-sm text-white hover:bg-aldi-navy/90"
      >
        Add
      </SubmitButton>
    </form>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-xs text-gray-500">
      <span className="mb-0.5 block">{label}</span>
      {children}
    </label>
  );
}
