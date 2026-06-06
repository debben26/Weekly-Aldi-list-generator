// Placeholder for pages whose functionality arrives in a later milestone.
export default function Placeholder({
  title,
  milestone,
}: {
  title: string;
  milestone: string;
}) {
  return (
    <div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-gray-500">Coming in {milestone}.</p>
    </div>
  );
}
