/** What gets synced between computers. Each kind is one record per key (a chat, a book, an assistant…). */
export const syncKinds = [
  'chat',          // personal chats, with title and history
  'project',       // projects converted from a chat (PDF Studio or Cinema Studio)
  'usage-day',     // credits Kie reported, one record per day (merged, never conflicts)
  'cinema-job',    // image generations with their Kie task id and results
  'cinema-board',  // storyboards: script and shots
  'book',          // PDF Studio books (editable format; images as assets)
  'book-draft',    // unsaved edits of a book from the composer
  'book-note',     // notes anchored to book blocks
  'composer-book', // books made by the server composer, so the list follows the account
  'assistant',     // assistants with saved instructions
  'favorite',      // favorite models
  'pdf-original',  // imported PDFs edited in place (the file as an asset, up to 4 MB)
  'pdf-version',   // every saved version of an imported PDF (the file as an asset, up to 4 MB)
  'book-version',  // saved versions of a PDF Studio book (images as assets)
  'doc-chat',      // the «Crear con IA» chat and the assistant's history of one document
  'manual-unit',   // manual units of PDF Studio (elements and template; the PDF and its images as assets)
  'manual-version',// saved versions of a manual unit (a whole unit; files shared with it as assets)
  'kb-project',    // book projects: name, manual units and assistants that bring the book's context
  'kb-entry',      // knowledge base of a book project, one record per fact with its sources and history
] as const;

export type SyncKind = (typeof syncKinds)[number];

/** Kinds every computer knew before a newer kind existed: a computer that never saw a kind pulls it from the start. */
export const firstKinds: readonly SyncKind[] = syncKinds.slice(0, syncKinds.indexOf('kb-project'));
