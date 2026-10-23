import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TextBlock } from "@/lib/chapters";

import { BubbleRow } from "./bubble-row";

const block: TextBlock = {
  id: "block-1",
  panelId: "panel-1",
  chapterId: "chapter-1",
  index: 0,
  bbox: null,
  sourceText: "원문",
  baseTranslation: "Base",
  finalText: "Original line",
  confidence: 0.9,
  isEdited: false,
  editedBy: null,
  editedAt: null,
};

function renderRow(onSave: (text: string) => Promise<boolean>) {
  return render(
    <BubbleRow
      block={block}
      position={1}
      editable
      active={false}
      onActivate={() => {}}
      onDeactivate={() => {}}
      onPin={() => {}}
      onSave={onSave}
    />
  );
}

describe("BubbleRow", () => {
  it("does not claim Saved when the write failed", async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    renderRow(onSave);

    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "New line" } });
    fireEvent.blur(field);

    await waitFor(() => expect(onSave).toHaveBeenCalledWith("New line"));
    // The chip must not appear, and the editor returns to the stored value.
    expect(screen.queryByText("Saved")).toBeNull();
    await waitFor(() => expect(field.value).toBe("Original line"));
  });

  it("shows Saved only after the write resolves", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    renderRow(onSave);

    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "New line" } });
    fireEvent.blur(field);

    await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy());
  });

  it("does not write an unchanged line", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    renderRow(onSave);

    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.blur(field);

    expect(onSave).not.toHaveBeenCalled();
  });
});
