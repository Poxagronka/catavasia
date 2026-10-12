/**
 * Typed message namespaces. A namespace is declared once, in webview-ui/src/i18n/<name>/en.ts, which is
 * the typed source of keys. Every other language file must supply the same keys (compile-time check).
 * A key missing at run time falls back to English, then to the key itself.
 */

export type Messages = Readonly<Record<string, string>>;

export interface Namespace<M extends Messages = Messages> {
  readonly name: string;
  readonly messages: M;
}

/** Declare a namespace. `name` must equal the folder name under webview-ui/src/i18n/. */
export function defineNamespace<const M extends Messages>(name: string, messages: M): Namespace<M> {
  return { name, messages };
}

/** The type of a non-English dictionary: every key of the namespace, as a string. */
export type Translation<N extends Namespace> = { readonly [K in keyof N['messages']]: string };

export type MessageKey<N extends Namespace> = keyof N['messages'] & string;

/** Values for `{name}` placeholders in a message. */
export type Params = Readonly<Record<string, string | number>>;

/** Replace `{name}` placeholders. An unknown placeholder stays as written. */
export function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in params ? String(params[key]) : whole,
  );
}
