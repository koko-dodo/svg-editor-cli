import { describe, it, expect } from "vitest";

const { cases, compare, verifyCase } = require("./phase1-baseline.cjs") as {
  cases: { name: string; files: string[] }[];
  compare(actual: Record<string, Buffer>, expected: Record<string, Buffer>, label: string): void;
  verifyCase(spec: { name: string; files: string[] }): void;
};

describe("final byte-exact CLI baselines", () => {
  it.each(cases)("matches $name stdout/stderr/exit/files without normalization", spec => {
    verifyCase(spec);
  });
  it("rejects whitespace, newline, stderr, exit-code and SVG differences", () => {
    for (const file of ["stdout.txt", "stderr.txt", "exit-code.txt", "saved.svg"]) {
      for (const bytes of ["x  y\n", "x y", "x y\r\n"]) {
        expect(() => compare({ [file]: Buffer.from(bytes) }, { [file]: Buffer.from("x y\n") }, "negative-control"))
          .toThrow("byte mismatch");
      }
    }
  });
});
