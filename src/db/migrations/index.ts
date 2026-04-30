import sql0001 from "./0001_init.sql" with { type: "text" };
import sql0002 from "./0002_saved_filters.sql" with { type: "text" };
import sql0003 from "./0003_thread_prompt_fields.sql" with { type: "text" };
import sql0004 from "./0004_semantic_search.sql" with { type: "text" };
import sql0005 from "./0005_embedding_blob.sql" with { type: "text" };

export const migrations: Array<{ filename: string; sql: string }> = [
  { filename: "0001_init.sql", sql: sql0001 },
  { filename: "0002_saved_filters.sql", sql: sql0002 },
  { filename: "0003_thread_prompt_fields.sql", sql: sql0003 },
  { filename: "0004_semantic_search.sql", sql: sql0004 },
  { filename: "0005_embedding_blob.sql", sql: sql0005 },
];
