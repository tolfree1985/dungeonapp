import { describe, expect, it } from "vitest";
import { parseInventoryIntent } from "@/lib/engine/inventory/parseInventoryIntent";

describe("parseInventoryIntent", () => {
  it("does not treat plain 'hide' as an inventory stash", () => {
    const intent = parseInventoryIntent({ mode: "DO", text: "hide" });
    expect(intent).toBeNull();
  });
});
