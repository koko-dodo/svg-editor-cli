import type { PluginModule, PluginValue, RegistrationContext } from "../../../../src/api";
import { LoaderProvider } from "./LoaderProvider";
import { LoaderCommand } from "./LoaderCommand";
import { LoaderDecorator } from "./LoaderDecorator";
import { LoaderAttribute } from "./LoaderAttribute";

export class LoaderPlugin implements PluginModule {
  activate(context: RegistrationContext, options?: PluginValue): void {
    const label = options !== null && typeof options === "object" && "label" in options ? String(options.label) : "default";
    context.registerShape(new LoaderProvider());
    context.registerCommand(new LoaderCommand(label));
    context.registerDecorator(new LoaderDecorator(label));
    context.registerAttribute(new LoaderAttribute());
  }
}
