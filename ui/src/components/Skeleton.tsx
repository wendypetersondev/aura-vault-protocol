interface Props {
  rows?: number;
}

export function Skeleton({ rows = 2 }: Props) {
  return (
    <div role="status" aria-label="Loading" aria-busy="true" className="skeleton-wrapper">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-row" />
      ))}
    </div>
  );
}
