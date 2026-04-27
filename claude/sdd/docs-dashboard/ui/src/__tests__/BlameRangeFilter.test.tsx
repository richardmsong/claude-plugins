import React from "react";
import { render, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "bun:test";
import BlameRangeFilter from "../components/BlameRangeFilter";

describe("BlameRangeFilter", () => {
  it("renders with 'All time' selected by default", () => {
    const { container } = render(
      <BlameRangeFilter value={{ mode: "all" }} onChange={vi.fn()} />
    );
    const select = container.querySelector("select") as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(select.value).toBe("all");
  });

  it("shows no date or branch input when mode is 'all'", () => {
    const { container } = render(
      <BlameRangeFilter value={{ mode: "all" }} onChange={vi.fn()} />
    );
    expect(container.querySelector("input")).toBeNull();
  });

  it("calls onChange with mode 'since' when selected", () => {
    const onChange = vi.fn();
    const { container } = render(
      <BlameRangeFilter value={{ mode: "all" }} onChange={onChange} />
    );
    const select = container.querySelector("select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "since" } });
    expect(onChange).toHaveBeenCalledWith({ mode: "since", since: undefined });
  });

  it("calls onChange with mode 'branch' when selected", () => {
    const onChange = vi.fn();
    const { container } = render(
      <BlameRangeFilter value={{ mode: "all" }} onChange={onChange} />
    );
    const select = container.querySelector("select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "branch" } });
    expect(onChange).toHaveBeenCalledWith({ mode: "branch", ref: undefined });
  });

  it("shows a date input when mode is 'since'", () => {
    const { container } = render(
      <BlameRangeFilter value={{ mode: "since" }} onChange={vi.fn()} />
    );
    const input = container.querySelector("input[type='date']");
    expect(input).not.toBeNull();
  });

  it("shows a text input when mode is 'branch'", () => {
    const { container } = render(
      <BlameRangeFilter value={{ mode: "branch" }} onChange={vi.fn()} />
    );
    const input = container.querySelector("input[type='text']");
    expect(input).not.toBeNull();
  });

  it("calls onChange with since value when date input changes", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <BlameRangeFilter value={{ mode: "since", since: "" }} onChange={onChange} />
    );
    const input = container.querySelector("input[type='date']") as HTMLInputElement;
    await user.type(input, "2026-04-01");
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall.mode).toBe("since");
    expect(typeof lastCall.since).toBe("string");
    expect(lastCall.since!.length).toBeGreaterThan(0);
  });

  it("calls onChange with ref value when branch input changes", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <BlameRangeFilter value={{ mode: "branch", ref: "" }} onChange={onChange} />
    );
    const input = container.querySelector("input[type='text']") as HTMLInputElement;
    await user.type(input, "feature-branch");
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall.mode).toBe("branch");
    expect(lastCall.ref).toContain("feature");
  });
});
