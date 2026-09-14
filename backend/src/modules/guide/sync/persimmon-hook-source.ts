import { ThemedHookReservation, ThemedHookSourceStore } from './themed-hook-source';

export type PersimmonHookReservation = ThemedHookReservation;

export class PersimmonHookSourceStore extends ThemedHookSourceStore {
  constructor(
    dataRoot: string,
    fetchDocument?: (docId: string) => Promise<string>,
    random = Math.random,
  ) {
    super(dataRoot, {
      cacheFileName: 'spotlight-v6-persimmon-hooks.json',
      label: 'Hook mùa hồng',
      sheetLabel: 'Hook mùa hồng',
      userAgent: 'Dalat Carousel Persimmon Hook Reader',
    }, fetchDocument, random);
  }
}
