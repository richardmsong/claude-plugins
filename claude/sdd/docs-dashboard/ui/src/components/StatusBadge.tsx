type Status = "draft" | "accepted" | "implemented" | "superseded" | "withdrawn" | null;

interface StatusBadgeProps {
  status: Status | string | null;
  historyDates?: { date: string; label: string }[];
}

const STATUS_COLORS: Record<string, { bg: string; color: string; border?: string }> = {
  draft: { bg: "#744210", color: "#fbd38d", border: "1px dashed #ed8936" },
  accepted: { bg: "#1a365d", color: "#63b3ed" },
  implemented: { bg: "#1c4532", color: "#68d391" },
  superseded: { bg: "#2d3748", color: "#718096" },
  withdrawn: { bg: "#2d3748", color: "#718096" },
};

export default function StatusBadge({ status, historyDates }: StatusBadgeProps) {
  if (!status) return null;

  const colors = STATUS_COLORS[status] ?? { bg: "#2d3748", color: "#a0aec0" };

  return (
    <span
      title={
        historyDates
          ? historyDates.map((h) => `${h.date}: ${h.label}`).join("\n")
          : status
      }
      style={{
        display: "inline-block",
        padding: "0.2em 0.6em",
        borderRadius: "4px",
        fontSize: "0.8em",
        fontWeight: 600,
        background: colors.bg,
        color: colors.color,
        border: colors.border ?? `1px solid transparent`,
        cursor: historyDates ? "help" : "default",
        userSelect: "none",
      }}
    >
      {status}
    </span>
  );
}
