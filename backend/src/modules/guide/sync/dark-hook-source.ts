import { ThemedHookReservation, ThemedHookSourceStore } from './themed-hook-source';

export type DarkHookReservation = ThemedHookReservation;

export class DarkHookSourceStore extends ThemedHookSourceStore {
  constructor(
    dataRoot: string,
    fetchDocument?: (docId: string) => Promise<string>,
    random = Math.random,
  ) {
    super(dataRoot, {
      cacheFileName: 'spotlight-v6-dark-hooks.json',
      label: 'Hook tone tối',
      sheetLabel: 'Hook tone tối',
      userAgent: 'Dalat Carousel Dark Hook Reader',
    }, fetchDocument, random);
  }
}
