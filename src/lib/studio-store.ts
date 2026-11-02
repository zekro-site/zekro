"use client";

import { useMemo } from "react";
import { useLocalStore } from "@/components/wallet/useLocalStore";
import { storageKey } from "@/config/storage";
import { decodeIdentity, encodeIdentity, newIdentity, type Identity, type ProofBundle } from "@/lib/zk/core";

/* What the studio keeps in this browser. Identities never leave it unless the member copies a backup. */

const IDS = storageKey("identities");
export const PRACTICE_KEY = storageKey("practice-book");
export const LAST_BUNDLE_KEY = storageKey("last-bundle");

export type StoredIdentity = { label: string; backup: string; createdAt: number };

const valid = (x: unknown): x is StoredIdentity => {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (typeof o.label !== "string" || typeof o.backup !== "string" || typeof o.createdAt !== "number") return false;
  try {
    decodeIdentity(o.backup);
    return true;
  } catch {
    return false;
  }
};

export function useIdentities() {
  const [raw, save] = useLocalStore<StoredIdentity[]>(IDS, []);
  const list = useMemo(() => (Array.isArray(raw) ? raw.filter(valid) : []), [raw]);
  const create = (label: string): Identity => {
    const id = newIdentity();
    save([...list, { label: label.trim().slice(0, 40) || `Identity ${list.length + 1}`, backup: encodeIdentity(id), createdAt: Date.now() }]);
    return id;
  };
  const restore = (label: string, backup: string) => {
    const id = decodeIdentity(backup);
    const text = encodeIdentity(id);
    if (list.some((x) => x.backup === text)) throw new Error("That identity is already in this browser.");
    save([...list, { label: label.trim().slice(0, 40) || `Identity ${list.length + 1}`, backup: text, createdAt: Date.now() }]);
  };
  const remove = (backup: string) => save(list.filter((x) => x.backup !== backup));
  return { list, create, restore, remove };
}

export function saveLastBundle(b: ProofBundle) {
  try {
    localStorage.setItem(LAST_BUNDLE_KEY, JSON.stringify(b));
  } catch {
    // Storage blocked: the bundle stays on screen.
  }
}

export function readLastBundle(): string | null {
  try {
    return localStorage.getItem(LAST_BUNDLE_KEY);
  } catch {
    return null;
  }
}
