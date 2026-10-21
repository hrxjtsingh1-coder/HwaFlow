import { ROLE_LABEL, type GroupRole } from "@/lib/groups";

export function RoleBadge({
  role,
  className,
}: {
  role: GroupRole;
  className?: string;
}) {
  return (
    <span
      className={`role-badge${className ? ` ${className}` : ""}`}
      data-role={role}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}
