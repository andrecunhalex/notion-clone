export { DesignLibraryProvider, useDesignLibrary } from './DesignLibraryProvider';
export { useLibrarySnapshot, useLibraryTemplate } from './useLibrarySnapshot';
export {
  getTemplateFromStore,
  getClauseFromStore,
  getLibrarySnapshot,
  subscribeLibrary,
  setActiveLibrary,
  releaseActiveLibrary,
  getActiveLibrary,
} from './store';
export { createFallbackLibrary } from './fallbackLibrary';
export { createSupabaseLibrary } from './supabaseLibrary';
export {
  normalize,
  getTemplateSearchBlob,
  getClauseSearchBlob,
  matchesTemplate,
  matchesClause,
} from './search';
export type {
  DesignLibraryInterface,
  DesignLibraryConfig,
  LibraryTemplate,
  LibraryClause,
  LibrarySnapshot,
  ClauseItem,
  TemplateInput,
  ClauseInput,
} from './types';
