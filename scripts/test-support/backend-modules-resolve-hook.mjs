import { pathToFileURL } from 'node:url';
import path from 'node:path';

const backendParent = pathToFileURL(path.resolve(import.meta.dirname, '../../backend/package.json')).href;
const isBareSpecifier = specifier => !/^(?:[./]|node:|file:|data:|[a-zA-Z]:[\\/])/.test(specifier);

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND' || !isBareSpecifier(specifier)) throw error;
    return nextResolve(specifier, { ...context, parentURL: backendParent });
  }
}
