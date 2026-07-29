export interface CacheResult<T> {
  data: T;
  fetchedAt: string;
  fromCache: boolean;
  stale: boolean;
}

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

export class MemoryCache<T> {
  private entry: CacheEntry<T> | null = null;
  private refreshPromise: Promise<T> | null = null;

  constructor(private readonly ttlMs: number) {}

  async getOrRefresh(loader: () => Promise<T>): Promise<CacheResult<T>> {
    const now = Date.now();

    if (this.entry && now - this.entry.fetchedAt < this.ttlMs) {
      return {
        data: this.entry.data,
        fetchedAt: new Date(this.entry.fetchedAt).toISOString(),
        fromCache: true,
        stale: false,
      };
    }

    try {
      const data = await this.refresh(loader);

      return {
        data,
        fetchedAt: new Date(this.entry!.fetchedAt).toISOString(),
        fromCache: false,
        stale: false,
      };
    } catch (error) {
      if (this.entry) {
        return {
          data: this.entry.data,
          fetchedAt: new Date(this.entry.fetchedAt).toISOString(),
          fromCache: true,
          stale: true,
        };
      }

      throw error;
    }
  }

  private async refresh(loader: () => Promise<T>): Promise<T> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = loader()
      .then((data) => {
        this.entry = {
          data,
          fetchedAt: Date.now(),
        };

        return data;
      })
      .finally(() => {
        this.refreshPromise = null;
      });

    return this.refreshPromise;
  }

  clear(): void {
    this.entry = null;
  }
}