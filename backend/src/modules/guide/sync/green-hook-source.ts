import { ThemedHookReservation, ThemedHookSourceStore } from './themed-hook-source';

export type GreenHookReservation = ThemedHookReservation;

export class GreenHookSourceStore extends ThemedHookSourceStore {
  constructor(
    dataRoot: string,
    fetchDocument?: (docId: string) => Promise<string>,
    random = Math.random,
  ) {
    super(dataRoot, {
      cacheFileName: 'spotlight-v6-green-hooks.json',
      label: 'Hook mảng xanh',
      sheetLabel: 'Hook mảng xanh',
      userAgent: 'Dalat Carousel Green Hook Reader',
    }, fetchDocument, random);
  }
}
