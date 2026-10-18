/** The supported, resource-free paint vocabulary shared by editing and SVG IO. */
export class StyleValidation {
  private static readonly keywords = new Set((
    "none transparent currentcolor inherit initial unset " +
    "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood " +
    "cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet " +
    "deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon " +
    "lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin " +
    "navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen"
  ).split(" "));

  static paint(value: string): void {
    // Keep the original value (including case/whitespace) for faithful round trips.
    const text = value.trim().toLowerCase();
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) this.reject(value);
    if (this.keywords.has(text) || /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/.test(text)) return;
    const match = /^(rgb|rgba|hsl|hsla)\(([^()]*)\)$/.exec(text);
    if (!match) this.reject(value);
    const body = match[2]!;
    const legacy = body.includes(",");
    let channels: string[];
    let alpha: string | undefined;
    if (legacy) {
      channels = body.split(",").map(part => part.trim());
      if (channels.length === 4) alpha = channels.pop();
    } else {
      const parts = body.split("/");
      if (parts.length > 2) this.reject(value);
      channels = parts[0]!.trim().split(/\s+/);
      if (parts.length === 2) alpha = parts[1]!.trim();
    }
    if (channels.length !== 3 || (alpha !== undefined && !this.number(alpha, "%?"))) this.reject(value);
    if (match[1]!.startsWith("rgb")) {
      if (!channels.every(part => this.number(part, "%?"))) this.reject(value);
      if (legacy && channels.some(part => part.endsWith("%")) && !channels.every(part => part.endsWith("%"))) this.reject(value);
    } else {
      if (!this.number(channels[0]!, "(?:deg|grad|rad|turn)?") ||
          !this.number(channels[1]!, "%") || !this.number(channels[2]!, "%")) this.reject(value);
    }
  }

  private static number(value: string, suffix: string): boolean {
    const match = new RegExp(`^([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?)${suffix}$`).exec(value);
    return match !== null && Number.isFinite(Number(match[1]));
  }
  private static reject(value: string): never { throw new Error(`unsupported SVG paint: ${value}`); }
}
