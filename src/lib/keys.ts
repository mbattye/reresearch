import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { isAdmin } from "./auth-config";
import { getDb, schema } from "./db";
import type { Provider } from "./db/schema";

// Readers' API keys are stored encrypted with AES-256-GCM under KEY_ENCRYPTION_SECRET (any long
// random string; it's hashed to 32 bytes). A key is decrypted only to make a model call, never
// logged, and never sent back to the browser: the UI only ever sees the provider and a hint.

function masterKey(): Buffer {
  const secret = process.env.KEY_ENCRYPTION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") throw new Error("KEY_ENCRYPTION_SECRET is not set");
    return createHash("sha256").update("reresearch-dev-only-key-encryption").digest();
  }
  return createHash("sha256").update(secret).digest();
}

/** "v1.<iv>.<tag>.<ciphertext>", all base64url. The user id is bound in as associated data. */
export function encryptKey(plain: string, userId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  cipher.setAAD(Buffer.from(userId));
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decryptKey(stored: string, userId: string): string {
  const [version, iv, tag, data] = stored.split(".");
  if (version !== "v1") throw new Error("Unknown key format");
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(userId));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export interface StoredKeyInfo {
  provider: Provider;
  hint: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export async function listKeys(userId: string): Promise<StoredKeyInfo[]> {
  const db = await getDb();
  return db
    .select({
      provider: schema.userKeys.provider,
      hint: schema.userKeys.hint,
      createdAt: schema.userKeys.createdAt,
      lastUsedAt: schema.userKeys.lastUsedAt,
    })
    .from(schema.userKeys)
    .where(eq(schema.userKeys.userId, userId));
}

/** Checks the key with a tiny real request, then stores it encrypted. Throws a readable error if it doesn't work. */
export async function saveKey(userId: string, provider: Provider, raw: string): Promise<void> {
  const key = raw.trim();
  if (key.length < 20 || key.length > 300 || /\s/.test(key)) throw new Error("That doesn't look like an API key");
  await verifyKey(provider, key);
  const db = await getDb();
  const values = { userId, provider, ciphertext: encryptKey(key, userId), hint: key.slice(-4), createdAt: new Date() };
  await db
    .insert(schema.userKeys)
    .values(values)
    .onConflictDoUpdate({ target: [schema.userKeys.userId, schema.userKeys.provider], set: values });
}

export async function deleteKey(userId: string, provider: Provider): Promise<void> {
  const db = await getDb();
  await db
    .delete(schema.userKeys)
    .where(and(eq(schema.userKeys.userId, userId), eq(schema.userKeys.provider, provider)));
}

/** Whether getKeyForWriting would find a key, without decrypting it or marking it used. */
export async function hasKeyFor(userId: string, email: string, provider: Provider): Promise<boolean> {
  if (provider === "anthropic" && isAdmin(email) && process.env.ANTHROPIC_API_KEY) return true;
  const db = await getDb();
  const [row] = await db
    .select({ provider: schema.userKeys.provider })
    .from(schema.userKeys)
    .where(and(eq(schema.userKeys.userId, userId), eq(schema.userKeys.provider, provider)));
  return !!row;
}

/**
 * The key to write with: the reader's own, or for admins the deployment's ANTHROPIC_API_KEY
 * as a fallback. Null when the reader has no usable key for this provider.
 */
export async function getKeyForWriting(userId: string, email: string, provider: Provider): Promise<string | null> {
  const db = await getDb();
  const [row] = await db
    .select({ ciphertext: schema.userKeys.ciphertext })
    .from(schema.userKeys)
    .where(and(eq(schema.userKeys.userId, userId), eq(schema.userKeys.provider, provider)));
  if (row) {
    await db
      .update(schema.userKeys)
      .set({ lastUsedAt: sql`now()` })
      .where(and(eq(schema.userKeys.userId, userId), eq(schema.userKeys.provider, provider)));
    return decryptKey(row.ciphertext, userId);
  }
  if (provider === "anthropic" && isAdmin(email) && process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  return null;
}

async function verifyKey(provider: Provider, key: string) {
  if (provider === "anthropic") {
    try {
      // Listing models is free and needs a valid key.
      await new Anthropic({ apiKey: key, maxRetries: 0, timeout: 15_000 }).models.list({ limit: 1 });
      return;
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        throw new Error("Anthropic rejected that key");
      }
      throw new Error("Couldn't check the key with Anthropic; try again");
    }
  }
  if (provider === "openai") {
    // Listing models is free and needs a valid key.
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return;
    if (res.status === 401 || res.status === 403) {
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (/scope|permission/i.test(body.error?.message ?? "")) {
        throw new Error("That restricted key needs read access to Models and write access to Responses");
      }
      throw new Error("OpenAI rejected that key");
    }
    throw new Error(`Couldn't check the key with OpenAI (${res.status}); try again`);
  }
  // OpenRouter's key endpoint returns the key's own limits; 401 when invalid.
  const res = await fetch("https://openrouter.ai/api/v1/key", {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401 || res.status === 403) throw new Error("OpenRouter rejected that key");
  if (!res.ok) throw new Error(`Couldn't check the key with OpenRouter (${res.status}); try again`);
}
