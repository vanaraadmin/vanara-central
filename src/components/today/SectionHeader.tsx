type SectionHeaderProps = {
  title: string;
  count: number;
};

export default function SectionHeader({
  title,
  count,
}: SectionHeaderProps) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      <span>{count}</span>
    </div>
  );
}