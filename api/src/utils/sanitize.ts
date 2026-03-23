/**
 * Escapes SQL LIKE pattern wildcards in user input.
 * Prevents users from using % or _ as wildcards in ilike() queries.
 */
export function escapeLike(input: string): string {
  return input.replace(/%/g, '\\%').replace(/_/g, '\\_');
}
