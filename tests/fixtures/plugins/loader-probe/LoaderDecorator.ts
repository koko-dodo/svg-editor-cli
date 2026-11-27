import type { TreeDecorator } from "../../../../src/api";
export class LoaderDecorator implements TreeDecorator {
  readonly name = "loader-tag";
  constructor(private readonly label: string) {}
  tags(): readonly string[] { return [`[${this.label}]`]; }
}
