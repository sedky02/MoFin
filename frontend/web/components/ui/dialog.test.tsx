// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";

// The content's box in these tests: x and y from 100 to 300.
const BOX = { left: 100, top: 100, right: 300, bottom: 300 } as DOMRect;

async function setup() {
  const onOpenChange = vi.fn();
  render(
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Title</DialogTitle>
        <DialogDescription>Body</DialogDescription>
      </DialogContent>
    </Dialog>,
  );
  screen.getByRole("dialog").getBoundingClientRect = () => BOX;
  // Radix starts listening for outside presses on the next tick.
  await act(() => new Promise((resolve) => setTimeout(resolve)));
  const overlay = document.querySelector('[data-slot="dialog-overlay"]') as HTMLElement;
  return { onOpenChange, overlay };
}

/** A press whose event carries a position, whatever this environment's PointerEvent keeps. */
function pressOn(target: Element, clientX: number, clientY: number) {
  const event = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX, clientY });
  fireEvent(target, event);
  fireEvent.click(target);
}

describe("DialogContent", () => {
  afterEach(cleanup);

  it("closes on a press on the backdrop", async () => {
    const { onOpenChange, overlay } = await setup();
    pressOn(overlay, 20, 20);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("stays open when a press inside it falls through to the backdrop", async () => {
    // What happens while a select is open: the content takes no pointer events, the overlay does.
    const { onOpenChange, overlay } = await setup();
    pressOn(overlay, 200, 200);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("stays open for a press on anything but the backdrop", async () => {
    const { onOpenChange } = await setup();
    pressOn(document.documentElement, 20, 20);
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
