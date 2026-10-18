import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Readable } from "node:stream";
import { expect, it } from "vitest";
import { Repl } from "../../src/cli/Repl";
import { SvgReader } from "../../src/io/SvgReader";

it("awaits real read/edit/save in input order and routes warnings/errors separately", async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), "svg-cli-"));
  try {
    const input = join(directory, "input file.svg"); const output = join(directory, "output file.svg");
    await fs.writeFile(input, '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect x="0" y="0" width="2" height="3"/></svg>');
    const out = new PassThrough(); const err = new PassThrough(); let stdout = ''; let stderr = '';
    out.on('data', chunk => { stdout += chunk; }); err.on('data', chunk => { stderr += chunk; });
    await new Repl(Readable.from([`read "${input}"\nmove rect1 5 6\nsave "${output}"\nundo\nread "${output}"\nshow rect1\nsave\n`]), out, err).run();
    expect(stderr).toBe('warning: assigned id rect1 to unnamed <rect>\nerror: undo not allowed after io command\n');
    expect(stdout).toContain(`read ${input} (1 elements)`);
    expect(stdout).toContain(`saved to ${output} (1 elements)`);
    expect(stdout).toContain('x=5 y=6 width=2 height=3');
    expect(stdout).not.toContain('warning:'); expect(stdout).not.toContain('Task 7');
    expect(new SvgReader().read(await fs.readFile(output, 'utf8')).document.hasShape('rect1')).toBe(true);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
