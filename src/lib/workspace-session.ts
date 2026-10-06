/** Keep date/filter choices, but discard cached reads after a local write succeeds. */
export function invalidateWorkspaceReads(values: Map<string, unknown>) {
  for (const key of values.keys()) {
    if (key.endsWith(':data') || key.endsWith(':table-signature'))
      values.delete(key);
  }
}
