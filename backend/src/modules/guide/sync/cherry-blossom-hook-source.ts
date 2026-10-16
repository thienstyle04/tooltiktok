import { ThemedHookSourceStore } from './themed-hook-source';

export class CherryBlossomHookSourceStore extends ThemedHookSourceStore {
  constructor(dataRoot: string, fetchDocument?: (id: string) => Promise<string>) {
    super(dataRoot, { cacheFileName: 'spotlight-v6-cherry-blossom-hooks.json', label: 'Hook hoa đào',
      sheetLabel: 'Hook hoa đào', userAgent: 'Dalat Carousel Cherry Blossom Hook Reader' }, fetchDocument);
  }
}
