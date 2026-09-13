import { useSyncExternalStore } from 'react';

/** A minimal observable value; React reads it through useStore, plain modules through get/subscribe. */
export interface Store<T> {
  get(): T;
  set(next: T): void;
  update(patch: Partial<T>): void;
  subscribe(listener: (value: T) => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<(value: T) => void>();
  const set = (next: T) => {
    if (next === value) return;
    value = next;
    for (const listener of [...listeners]) listener(value);
  };
  return {
    get: () => value,
    set,
    update: (patch) => {
      for (const key of Object.keys(patch) as (keyof T)[]) if (patch[key] !== value[key]) { set({ ...value, ...patch }); return; }
    },
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

export function useStore<T extends object>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
