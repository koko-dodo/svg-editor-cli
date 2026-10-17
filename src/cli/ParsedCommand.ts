import type { CanvasSize, CreateRequest } from "../services/EditorTypes";

export type ParsedCommand =
  | { readonly kind: "init"; readonly width: number; readonly height: number }
  | { readonly kind: "canvas"; readonly size: CanvasSize | null }
  | { readonly kind: "create"; readonly request: CreateRequest }
  | { readonly kind: "delete"; readonly id: string }
  | { readonly kind: "move"; readonly id: string; readonly dx: number; readonly dy: number }
  | { readonly kind: "scale"; readonly id: string; readonly factor: number }
  | { readonly kind: "set"; readonly id: string; readonly attribute: string; readonly value: string }
  | { readonly kind: "group"; readonly id: string; readonly members: readonly string[] }
  | { readonly kind: "ungroup"; readonly id: string }
  | { readonly kind: "addto"; readonly groupId: string; readonly id: string }
  | { readonly kind: "front"; readonly id: string }
  | { readonly kind: "back"; readonly id: string }
  | { readonly kind: "tree"; readonly id: string | undefined }
  | { readonly kind: "show"; readonly id: string }
  | { readonly kind: "help" }
  | { readonly kind: "undo" }
  | { readonly kind: "redo" }
  | { readonly kind: "read"; readonly path: string }
  | { readonly kind: "save"; readonly path: string | undefined };
