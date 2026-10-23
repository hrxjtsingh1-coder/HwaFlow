import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useDialogA11y } from "./use-dialog";

function Dialog({ open }: { open: boolean }) {
  const ref = useDialogA11y(open, () => {});
  return <div ref={ref} tabIndex={-1} />;
}

describe("useDialogA11y body lock", () => {
  it("stays locked until the last open dialog closes", () => {
    document.body.style.overflow = "";

    const { rerender } = render(
      <>
        <Dialog open />
        <Dialog open />
      </>
    );

    expect(document.body.style.overflow).toBe("hidden");

    // Closing the inner dialog must not unlock the page behind the outer one.
    rerender(
      <>
        <Dialog open />
        <Dialog open={false} />
      </>
    );
    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <>
        <Dialog open={false} />
        <Dialog open={false} />
      </>
    );
    expect(document.body.style.overflow).toBe("");
  });
});
