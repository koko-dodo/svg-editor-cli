import { expect, it } from "vitest";
const { runAcceptance } = require("./assembly.cjs") as {
  runAcceptance(options?: { capture?: boolean }): {
    results: { name: string }[]; compatibility: string[]; actualABCommitProof: string;
  };
};
it("compares real code/config processes, actual final compatibility and frozen Git history", () => {
  const result = runAcceptance();
  expect(result.results.map(item => item.name)).toEqual(["section6", "box", "commands"]);
  expect(result.compatibility).toHaveLength(3);
  expect(result.actualABCommitProof).toContain("PENDING");
}, 30000);
it("refuses to refresh existing acceptance expectations", () => {
  expect(() => runAcceptance({ capture: true })).toThrow("capture refuses existing expectations");
});
