import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface PhotoStorage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

const KEY_RE = /^[a-z0-9-]{8,80}$/;

/** Development implementation. Not suitable for >1 replica or a read-only root filesystem: use object storage (S3) there. */
export class LocalDiskStorage implements PhotoStorage {
  constructor(private readonly dir: string) {}

  private path(key: string): string {
    if (!KEY_RE.test(key)) throw new Error('invalid storage key');
    return join(this.dir, `${key}.jpg`);
  }
  async put(key: string, data: Buffer): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.path(key), data);
  }
  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.path(key));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }
  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }
}
