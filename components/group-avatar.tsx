import { groupAccent, groupMonogram } from "@/lib/groups";

type GroupAvatarProps = {
  name: string;
  iconDataUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

/**
 * Uploaded icon when present, otherwise a deterministic monogram on one of
 * the four pastel accents. Purely decorative — the name always sits next to it.
 */
export function GroupAvatar({
  name,
  iconDataUrl,
  size = "md",
  className,
}: GroupAvatarProps) {
  return (
    <span
      className={`group-avatar group-avatar--${size}${className ? ` ${className}` : ""}`}
      data-accent={groupAccent(name)}
      aria-hidden="true"
    >
      {iconDataUrl ? (
        // A data URL, so next/image would add no value here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={iconDataUrl} alt="" />
      ) : (
        <span>{groupMonogram(name)}</span>
      )}
    </span>
  );
}
