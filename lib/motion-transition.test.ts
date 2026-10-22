import { describe, expect, it } from "vitest";

import { consumeNavigationDirection } from "@/components/motion/reveal";

type FakeRoot = {
  dataset: { motionDirection?: string };
};

function pageElement() {
  const properties = new Map<string, string>();

  return {
    style: {
      setProperty(name: string, value: string) {
        properties.set(name, value);
      },
    },
    properties,
  };
}

describe("page transition direction handoff", () => {
  it("synchronizes a backward primary-navigation click with the new page", () => {
    const root: FakeRoot = { dataset: { motionDirection: "backward" } };
    const page = pageElement();

    expect(consumeNavigationDirection(root, page)).toBe("backward");
    expect(page.properties.get("--motion-page-direction")).toBe("-1");
    expect(root.dataset.motionDirection).toBeUndefined();
  });

  it("consumes each handoff so rapid navigation cannot reuse stale state", () => {
    const root: FakeRoot = { dataset: { motionDirection: "forward" } };
    const firstPage = pageElement();
    const secondPage = pageElement();

    expect(consumeNavigationDirection(root, firstPage)).toBe("forward");

    // A later navigation that has not written a new direction gets the neutral
    // forward default instead of inheriting the first click's state.
    expect(consumeNavigationDirection(root, secondPage)).toBe("forward");
    expect(secondPage.properties.get("--motion-page-direction")).toBe("1");
  });

  it("treats malformed or secondary-navigation state as the safe default", () => {
    const root: FakeRoot = { dataset: { motionDirection: "sideways" } };
    const page = pageElement();

    expect(consumeNavigationDirection(root, page)).toBe("forward");
    expect(root.dataset.motionDirection).toBeUndefined();
  });
});
