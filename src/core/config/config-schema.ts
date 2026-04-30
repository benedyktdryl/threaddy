import { z } from "zod";

// ── helpers ────────────────────────────────────────────────────────────────

function isAbsPath(v: string) {
  return v === "~" || v.startsWith("/") || v.startsWith("~/");
}

// RFC 1123 hostname label: 1-63 chars, alphanumeric + hyphens, no leading/trailing hyphen
const HOSTNAME_LABEL = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
const IPV4 = /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
// Simplified IPv6: covers ::1, full 8-group, and compressed forms
const IPV6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:)*:([0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}|::1|::)$/;

function isValidHost(v: string) {
  if (IPV4.test(v) || IPV6.test(v)) return true;
  const labels = v.split(".");
  // If any label is all-digits, the whole value must be a valid IPv4 or IPv6 — no mixed forms like 127.0.0.1aaaaa
  if (labels.some((l) => /^\d+$/.test(l))) return false;
  return labels.every((label) => HOSTNAME_LABEL.test(label));
}

// ── field schemas ──────────────────────────────────────────────────────────

const hostSchema = z
  .string()
  .min(1, "Required")
  .refine(isValidHost, "Must be a valid hostname or IP address");

const absPathSchema = z
  .string()
  .min(1, "Required")
  .refine(isAbsPath, "Must be an absolute path (starting with / or ~/)");

const portSchema = z.coerce
  .number({ invalid_type_error: "Must be a number" })
  .int("Must be a whole number")
  .min(1, "Must be 1–65535")
  .max(65535, "Must be 1–65535");

const posIntSchema = (label: string) =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number` })
    .int("Must be a whole number")
    .min(1, "Must be at least 1");

const nonNegIntSchema = z.coerce
  .number({ invalid_type_error: "Must be a number" })
  .int("Must be a whole number")
  .min(0, "Cannot be negative");

// ── full config schema ─────────────────────────────────────────────────────

export const configSchema = z.object({
  dbPath: absPathSchema,
  server: z.object({
    host: hostSchema,
    port: portSchema,
  }),
  providers: z.object({
    codex: z.object({
      enabled: z.boolean(),
      roots: z.array(absPathSchema),
    }),
    claudeCode: z.object({
      enabled: z.boolean(),
      roots: z.array(absPathSchema),
    }),
    cursor: z.object({
      enabled: z.boolean(),
      roots: z.array(absPathSchema),
    }),
  }),
  indexing: z.object({
    messageFts: z.boolean(),
    batchSize: posIntSchema("Batch size"),
    maxPreviewLength: posIntSchema("Max preview length"),
  }),
  watch: z.object({
    enabled: z.boolean(),
    debounceMs: nonNegIntSchema,
  }),
  excludes: z.array(z.string()),
  semanticSearch: z.object({
    enabled: z.boolean(),
    model: z.string().min(1, "Required"),
    mode: z.enum(["hybrid", "semantic", "keyword"]),
    chunkSize: posIntSchema("Chunk size"),
    chunkOverlap: nonNegIntSchema,
    enableFts: z.boolean(),
  }),
});

export type ConfigFormData = z.infer<typeof configSchema>;

// ── flatten Zod errors to field-path → message map ────────────────────────

export function flattenZodErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    // For array items (e.g. providers.codex.roots.0), roll up to the array field
    const parts = issue.path.map(String);
    const lastIsIndex = parts.length > 0 && /^\d+$/.test(parts[parts.length - 1]);
    const key = lastIsIndex
      ? parts.slice(0, -1).join(".")
      : parts.join(".");

    if (!key) continue;

    if (lastIsIndex) {
      const lineNum = Number(parts[parts.length - 1]) + 1;
      out[key] = out[key] ?? `Line ${lineNum}: ${issue.message}`;
    } else {
      out[key] = out[key] ?? issue.message;
    }
  }
  return out;
}
