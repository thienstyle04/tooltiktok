export function canReadPublishedDataset(context, { draft = false, loading = false } = {}) {
  return Boolean(context?.dataset && !context.blocked && !draft && !loading);
}

export function canApplyPublishedDataset(before, current, sourceId, next, guards) {
  return canReadPublishedDataset(current, guards)
    && current.dataset === before.dataset
    && current.destinationId === sourceId
    && next?.source?.destinationId === sourceId;
}
