export async function resolve(specifier, context, nextResolve) {
  if (
    (specifier.startsWith('./') || specifier.startsWith('../'))
    && !/\.(js|mjs|json|node)$/.test(specifier)
  ) {
    try {
      return await nextResolve(`${specifier}.js`, context);
    } catch {
      // fall through to default resolver
    }
  }
  return nextResolve(specifier, context);
}
