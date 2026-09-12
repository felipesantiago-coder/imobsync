import { describe, expect, it } from "vitest";
import { withRetry } from "@/lib/cron-retry";

describe("withRetry", () => {
  it("resolve na 1ª tentativa sem chamar onRetry", async () => {
    let calls = 0;
    const retries: number[] = [];
    const result = await withRetry(
      async () => {
        calls++;
        return "ok";
      },
      { onRetry: (a) => retries.push(a) }
    );
    expect(result).toBe("ok");
    expect(calls).toBe(1);
    expect(retries).toEqual([]);
  });

  it("falha 1x e sucede na 2ª tentativa (2 chamadas)", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls === 1) throw new Error("blip transitório");
        return 42;
      },
      { retries: 2, baseDelayMs: 5 }
    );
    expect(result).toBe(42);
    expect(calls).toBe(2);
  });

  it("exaure retries e relança o ÚLTIMO erro", async () => {
    let calls = 0;
    const promise = withRetry(
      async () => {
        calls++;
        throw new Error(`falha ${calls}`);
      },
      { retries: 2, baseDelayMs: 5 }
    );
    await expect(promise).rejects.toThrow("falha 3");
    expect(calls).toBe(3); // 1 inicial + 2 extras (default)
  });

  it("retries: 0 significa tentativa única", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error("sempre falha");
        },
        { retries: 0, baseDelayMs: 5 }
      )
    ).rejects.toThrow("sempre falha");
    expect(calls).toBe(1);
  });

  it("negativo vira 0 (tentativa única)", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error("x");
        },
        { retries: -5, baseDelayMs: 5 }
      )
    ).rejects.toThrow("x");
    expect(calls).toBe(1);
  });

  it("backoff exponencial: esperas dobram (base 20ms → 20, 40)", async () => {
    let calls = 0;
    const waits: number[] = [];
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error("falha constante");
        },
        {
          retries: 2,
          baseDelayMs: 20,
          onRetry: (_a, _e, waitMs) => waits.push(waitMs),
        }
      )
    ).rejects.toThrow("falha constante");
    expect(calls).toBe(3);
    expect(waits).toEqual([20, 40]);
  });

  it("onRetry recebe a tentativa extra (1-based) e o erro original", async () => {
    const seen: Array<{ attempt: number; message: string }> = [];
    let calls = 0;
    await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error(`erro ${calls}`);
        return "ok";
      },
      { retries: 3, baseDelayMs: 5, onRetry: (a, e) => seen.push({ attempt: a, message: (e as Error).message }) }
    );
    expect(seen).toEqual([
      { attempt: 1, message: "erro 1" },
      { attempt: 2, message: "erro 2" },
    ]);
  });

  it("converte resultado { error } em throw para retentar (padrão supabase-js)", async () => {
    let calls = 0;
    const queryLike = async (): Promise<{ data: string[]; error: { message: string } | null }> => {
      calls++;
      if (calls === 1) return { data: [], error: { message: "fetch failed (transiente)" } };
      return { data: ["sub-1"], error: null };
    };
    const result = await withRetry(async () => {
      const { data, error } = await queryLike();
      if (error) throw new Error(error.message);
      return data;
    }, { retries: 2, baseDelayMs: 5 });
    expect(result).toEqual(["sub-1"]);
    expect(calls).toBe(2);
  });
});
