import { Reveal } from "./reveal";
import { SectionIntro } from "./section-intro";
import { Check, Lock } from "./icons";

const roles = [
  {
    name: "Owner",
    copy: "Runs the group: its settings, every series, and every chapter.",
    dot: "bg-[var(--accent)]",
  },
  {
    name: "Manager",
    copy: "Adds series, checks finished chapters, and chooses who works on what.",
    dot: "bg-[var(--success)]",
  },
  {
    name: "Staff",
    copy: "Works on the series they’re given, sends chapters for review, and sees what they’ve earned.",
    dot: "bg-[var(--warning)]",
  },
];

type Allowance = boolean | string;

const permissions: { action: string; values: [Allowance, Allowance, Allowance] }[] =
  [
    { action: "Create a series", values: [true, true, false] },
    { action: "Invite people", values: [true, "staff only", false] },
    { action: "Change a role", values: [true, false, false] },
    { action: "Approve a chapter", values: [true, true, false] },
    { action: "See every series", values: [true, true, false] },
  ];

function Mark({ value }: { value: Allowance }) {
  if (value === true) {
    return (
      <>
        <Check className="mx-auto h-3.5 w-3.5 text-[var(--success)]" />
        <span className="sr-only">Yes</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <span aria-hidden="true" className="text-[var(--border-strong)]">
          —
        </span>
        <span className="sr-only">No</span>
      </>
    );
  }
  return <span className="text-[9.5px] leading-tight text-muted">{value}</span>;
}

function AccessMatrix() {
  return (
    <div className="rounded-[1.75rem] border border-border bg-surface p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2 px-2 pt-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
          Access by role
        </p>
        <span className="chip chip-mint">
          <Lock className="h-2.5 w-2.5" />
          Built in
        </span>
      </div>

      <table className="mt-3 w-full border-collapse text-left">
        <caption className="sr-only">
          What each group role is allowed to do
        </caption>
        <thead>
          <tr className="border-y border-border">
            <th scope="col" className="py-2 pl-2">
              <span className="sr-only">Action</span>
            </th>
            {roles.map((role) => (
              <th
                key={role.name}
                scope="col"
                className="px-1 py-2 text-center text-[9.5px] font-semibold text-muted"
              >
                <span
                  aria-hidden="true"
                  className={`mx-auto mb-1 block h-1.5 w-1.5 rounded-full ${role.dot}`}
                />
                {role.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {permissions.map((row) => (
            <tr key={row.action} className="border-b border-border/70">
              <th
                scope="row"
                className="py-2.5 pl-2 pr-2 text-[11.5px] font-medium text-ink"
              >
                {row.action}
              </th>
              {row.values.map((value, index) => (
                <td
                  key={index}
                  className="px-1 py-2.5 text-center align-middle text-[11px]"
                >
                  <Mark value={value} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="px-2 pb-1 pt-3 text-[9.5px] leading-relaxed text-faint">
        Checked on every request, not only in the menu.
      </p>
    </div>
  );
}

export function Team() {
  return (
    <section id="team" className="scroll-mt-24 py-24 sm:py-32">
      <div className="shell grid items-center gap-14 lg:grid-cols-[1fr_1.02fr] lg:gap-20">
        <div>
          <Reveal>
            <SectionIntro
              title="The right people see the right series."
              copy="A group has three roles, and each one reaches exactly as far as it should."
            />
          </Reveal>

          <div className="mt-8 divide-y divide-border border-t border-border">
            {roles.map((role, index) => (
              <Reveal key={role.name} delay={index * 60}>
                <div className="flex items-start gap-3.5 py-3.5">
                  <span
                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${role.dot}`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{role.name}</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
                      {role.copy}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        <Reveal delay={120}>
          <AccessMatrix />
        </Reveal>
      </div>
    </section>
  );
}
