export function templateAllowed(source, deckId) {
  return Array.isArray(source?.allowedDeckIds) && source.allowedDeckIds.includes(deckId);
}

export function filterSourceTemplates(entries, source) {
  return (entries || []).filter(entry => templateAllowed(source, entry.id));
}

export function forbiddenTemplateSelections(selections, source) {
  return (selections || []).filter(entry => !templateAllowed(source, entry.deckId));
}
