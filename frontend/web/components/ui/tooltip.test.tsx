// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

afterEach(cleanup);

describe("Tooltip", () => {
  it("works without a TooltipProvider above it (the Categories page crashed without one)", () => {
    expect(() =>
      render(
        <Tooltip>
          <TooltipTrigger asChild>
            <button>Lock</button>
          </TooltipTrigger>
          <TooltipContent>System category</TooltipContent>
        </Tooltip>,
      ),
    ).not.toThrow();
    expect(screen.getByRole("button", { name: "Lock" })).toBeTruthy();
  });
});
