// Lets the test runner follow the app's own import style.
//
// The app writes `import { cat } from "./format"` with no extension, which is
// what the bundler expects. Node's ESM resolver requires the extension, so
// without this hook every test importing app code fails on resolution rather
// than on anything to do with the code being tested.
export async function resolve(specifier, context, nextResolve) {
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  const hasExtension = /\.[cm]?[jt]sx?$/i.test(specifier);

  if (isRelative && !hasExtension) {
    try {
      return await nextResolve(specifier + ".ts", context);
    } catch {
      // Fall through — let the real resolver produce the real error.
    }
  }
  return nextResolve(specifier, context);
}
