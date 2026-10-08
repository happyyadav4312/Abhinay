import { z } from 'zod';
import { blankToUndefined, LIMITS, pageQuerySchema, pageSizeQuerySchema } from './common';

/** Folder identity: trimmed, whitespace-collapsed, lowercased — "Callbacks" equals " callbacks". */
export function normalizeFolderName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** POST /casting/:id/shortlists and PATCH /casting/:id/shortlists/:folderId. */
export const shortlistFolderSchema = z
  .object({
    name: z
      .string({
        required_error: 'Folder name is required',
        invalid_type_error: 'Folder name must be text',
      })
      .trim()
      .transform((value) => value.replace(/\s+/g, ' '))
      .pipe(
        z
          .string()
          .min(1, 'Folder name is required')
          .max(
            LIMITS.SHORTLIST_FOLDER_NAME_MAX,
            `Folder name must not exceed ${LIMITS.SHORTLIST_FOLDER_NAME_MAX} characters`
          )
      ),
  })
  .strict();

/**
 * GET /casting/:id/applications — the author's applicant list, optionally only
 * the applicants filed in one folder.
 */
export const listApplicantsQuerySchema = z
  .object({
    folderId: z.preprocess(
      blankToUndefined,
      z.string().uuid('Folder must be a valid identifier').optional()
    ),
    page: pageQuerySchema,
    pageSize: pageSizeQuerySchema,
  })
  .strict();

export type ShortlistFolderInput = z.infer<typeof shortlistFolderSchema>;
export type ListApplicantsQuery = z.infer<typeof listApplicantsQuerySchema>;
