"use client";

import { useState } from "react";
import { Reveal } from "./reveal";
import { SectionHead } from "./section-head";
import { Check, Lock } from "./icons";

const roles = [
  {
    name: "Owner",
    tone: "owner",
    copy: "Runs the group: its settings, every series, and every chapter.",
  },
  {
    name: "Manager",
    tone: "manager",
    copy: "Adds series, checks finished chapters, and chooses who works on what.",
  },
  {
    name: "Staff",
    tone: "staff",
    copy: "Works on the series they’re given, sends chapters for review, and sees what they’ve earned.",
  },
];

type Allowance = boolean | string;

const permissions: {
  action: string;
  values: [Allowance, Allowance, Allowance];
}[] = [
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
        <Check className="matrix-check h-3.5 w-3.5" />
        <span className="sr-only">Yes</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <span aria-hidden="true" className="matrix-dash">
          —
        </span>
        <span className="sr-only">No</span>
      </>
    );
  }
  return <span className="matrix-note">{value}</span>;
}

function AccessMatrix({ active }: { active: number | null }) {
  return (
    <div className="team-matrix">
      <div className="matrix-cap">
        <p>Access by role</p>
        <span className="matrix-built">
          <Lock className="h-2.5 w-2.5" />
          Built in
        </span>
      </div>

      <table>
        <caption className="sr-only">
          What each group role is allowed to do
        </caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Action</span>
            </th>
            {roles.map((role, index) => (
              <th
                key={role.name}
                scope="col"
                className={`matrix-col ${active === index ? "is-active" : ""}`}
              >
                <span
                  aria-hidden="true"
                  className={`role-dot role-dot--${role.tone}`}
                />
                {role.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {permissions.map((row) => (
            <tr key={row.action} className="matrix-row">
              <th scope="row">{row.action}</th>
              {row.values.map((value, index) => (
                <td
                  key={index}
                  className={`matrix-col ${
                    active === index ? "is-active" : ""
                  }`}
                >
                  <Mark value={value} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="matrix-foot">
        <Lock className="h-3 w-3" />
        Checked on every request, not only in the menu.
      </p>
    </div>
  );
}

export function Team() {
  const [active, setActive] = useState<number | null>(null);

  return (
    <section id="team" className="team-section">
      <div className="shell">
        <Reveal>
          <SectionHead
            label="Access"
            title={
              <>
                The right people see the{" "}
                <span className="display-serif">right series</span>.
              </>
            }
            copy="A group has three roles, and each one reaches exactly as far as it should. Select a role to see what it can do."
          />
        </Reveal>

        <div className="team-grid">
          <div
            className="role-ladder"
            onMouseLeave={() => setActive(null)}
          >
            {roles.map((role, index) => (
              // Click sets, never toggles: a tap fires mouseenter first, so a
              // toggle would open the role and close it again in one gesture.
              <button
                key={role.name}
                type="button"
                className="role-row"
                data-active={active === index}
                aria-pressed={active === index}
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                onClick={() => setActive(index)}
              >
                <span
                  aria-hidden="true"
                  className={`role-dot role-dot--${role.tone}`}
                />
                <span className="role-main">
                  <span className="role-name">{role.name}</span>
                  <span className="role-copy">{role.copy}</span>
                </span>
                <span className="role-arrow" aria-hidden="true">
                  ↗
                </span>
              </button>
            ))}

            <p className="role-note">
              Roles are checked on every request, not only in the menu.
            </p>
          </div>

          <Reveal className="team-matrix-wrap" delay={100}>
            <AccessMatrix active={active} />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
