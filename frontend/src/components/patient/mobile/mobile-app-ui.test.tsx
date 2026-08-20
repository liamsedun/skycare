// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  AppAvatarTile,
  AppCard,
  AppEmpty,
  AppFab,
  AppFilterChips,
  AppHeader,
  AppSegmented,
  AppSheet,
  AppSkeletonList,
  AppStatusChip,
  cn,
  GhostButton,
  GoldButton,
} from "@/components/patient/mobile/mobile-app-ui";

describe("cn", () => {
  it("joins truthy parts and drops falsy ones", () => {
    expect(cn("a", "b", undefined, null, false, "c")).toBe("a b c");
    expect(cn()).toBe("");
  });
});

describe("AppCard", () => {
  it("renders children and fires onClick", () => {
    const fn = vi.fn();
    render(
      <AppCard onClick={fn}>
        <p>hello</p>
      </AppCard>
    );
    expect(screen.getByText("hello")).toBeInTheDocument();
    fireEvent.click(screen.getByText("hello"));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("AppHeader", () => {
  it("renders the title and the meta pill", () => {
    render(<AppHeader title="Overview" meta="3 pending" />);
    expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByText("3 pending")).toBeInTheDocument();
  });

  it("omits the pill without meta", () => {
    render(<AppHeader title="Overview" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("AppSegmented", () => {
  it("marks the active tab and fires onChange", () => {
    const fn = vi.fn();
    render(<AppSegmented tabs={[{ key: "upcoming", label: "Upcoming" }, { key: "past", label: "Past" }]} active="past" onChange={fn} />);
    expect(screen.getByRole("button", { name: "Upcoming" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Past" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Upcoming" }));
    expect(fn).toHaveBeenCalledWith("upcoming");
  });
});

describe("AppFilterChips", () => {
  it("renders chips and reports clicks with the key", () => {
    const fn = vi.fn();
    render(<AppFilterChips filters={[{ key: "a", label: "Alpha" }]} active="b" onChange={fn} />);
    const chip = screen.getByRole("button", { name: "Alpha" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(chip);
    expect(fn).toHaveBeenCalledWith("a");
  });
});

describe("buttons", () => {
  it("GoldButton respects the disabled state", () => {
    render(<GoldButton disabled>Save</GoldButton>);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("GhostButton forwards click handlers", () => {
    const fn = vi.fn();
    render(<GhostButton onClick={fn}>Cancel</GhostButton>);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("AppStatusChip", () => {
  it("humanises status labels", () => {
    render(<AppStatusChip status="partially_paid" />);
    expect(screen.getByText("Partially paid")).toBeInTheDocument();
  });

  it("applies the known-status palette and a neutral fallback", () => {
    const { container, rerender } = render(<AppStatusChip status="paid" />);
    expect(container.querySelector("span")!.className).toContain("bg-emerald-100");
    rerender(<AppStatusChip status="mystery" />);
    expect(container.querySelector("span")!.className).toContain("bg-slate-100");
  });
});

describe("AppSheet", () => {
  it("renders nothing when closed", () => {
    render(
      <AppSheet open={false} onClose={() => {}}>
        <p>content</p>
      </AppSheet>
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on backdrop click but not on inner click", () => {
    const fn = vi.fn();
    render(
      <AppSheet open onClose={fn} title="Sheet">
        <p>inner</p>
      </AppSheet>
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    fireEvent.click(screen.getByText("inner"));
    expect(fn).not.toHaveBeenCalled();
    fireEvent.click(dialog);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("AppFab", () => {
  it("exposes an aria-label and fires onClick", () => {
    const fn = vi.fn();
    render(
      <AppFab onClick={fn} label="Add member">
        +
      </AppFab>
    );
    const fab = screen.getByRole("button", { name: "Add member" });
    fireEvent.click(fab);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("AppSkeletonList", () => {
  it("renders the requested number of rows", () => {
    const { container } = render(<AppSkeletonList rows={4} />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(4);
  });
});

describe("AppEmpty", () => {
  it("renders icon + title + optional hint", () => {
    const Icon = () => <svg aria-label="empty icon" />;
    render(<AppEmpty icon={Icon as never} title="Nothing here" hint="Try again later" />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByText("Try again later")).toBeInTheDocument();
    expect(screen.getByLabelText("empty icon")).toBeInTheDocument();
  });
});

describe("AppAvatarTile", () => {
  it("renders a photo when avatarUrl is set", () => {
    render(<AppAvatarTile avatarUrl="https://cdn/x.jpg" name="Taiwo Mafe" />);
    expect(screen.getByAltText("Taiwo Mafe")).toHaveAttribute("src", "https://cdn/x.jpg");
  });

  it("derives initials from the first two words", () => {
    const { rerender } = render(<AppAvatarTile name="Taiwo Mafe" />);
    expect(screen.getByText("TM")).toBeInTheDocument();
    rerender(<AppAvatarTile name="Ada" />);
    expect(screen.getByText("A")).toBeInTheDocument();
    rerender(<AppAvatarTile name="   " />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });
});