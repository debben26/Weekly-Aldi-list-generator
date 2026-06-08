import StepNav from "./StepNav";

export default async function PlanLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="space-y-6">
      <StepNav planId={id} />
      {children}
    </div>
  );
}
