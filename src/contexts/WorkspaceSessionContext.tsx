import { invalidateWorkspaceReads } from '../lib/workspace-session';
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

// Scoped to the authenticated operator workspace. Never persisted to storage or shared
// between operators; unmounting the authenticated workspace discards booking data.
const WorkspaceSessionContext = createContext<Map<string, unknown> | null>(
  null,
);
export function WorkspaceSessionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const values = useRef(new Map<string, unknown>());
  return (
    <WorkspaceSessionContext.Provider value={values.current}>
      {children}
    </WorkspaceSessionContext.Provider>
  );
}
export function useWorkspaceSessionState<T>(
  key: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const values = useContext(WorkspaceSessionContext);
  if (!values)
    throw new Error(
      'Workspace session state requires an authenticated workspace',
    );
  const [value, setValue] = useState<T>(() =>
    values.has(key)
      ? (values.get(key) as T)
      : typeof initial === 'function'
        ? (initial as () => T)()
        : initial,
  );
  const update = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      setValue((previous) => {
        const resolved =
          typeof next === 'function'
            ? (next as (value: T) => T)(previous)
            : next;
        values.set(key, resolved);
        return resolved;
      });
    },
    [key, values],
  );
  return [value, update];
}

// Only successful local commission changes invalidate other loaded periods. Plain
// navigation never does. Keep date/filter choices while discarding financial reads.
export function useInvalidateWorkspaceReads() {
  const values = useContext(WorkspaceSessionContext);
  if (!values)
    throw new Error(
      'Workspace invalidation requires an authenticated workspace',
    );
  return useCallback(() => {
    invalidateWorkspaceReads(values);
  }, [values]);
}
