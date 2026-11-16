import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const records = new Map<
    string,
    { id: string; payload?: Record<string, unknown>; [key: string]: unknown }
  >();
  const state = {
    records,
    delayMs: 15,
    updateCalls: [] as Array<{ id: string; fields: Record<string, unknown> }>,
  };

  const notFound = (): Error =>
    Object.assign(new Error("404 Not Found"), { status: 404 });

  const client = {
    collection: () => ({
      create: async (fields: Record<string, unknown>) => {
        await sleep(state.delayMs);
        const id = `rec${String(records.size).padStart(12, "0")}`;
        const record = { id, ...fields };
        records.set(id, record);
        return structuredClone(record);
      },
      getOne: async (id: string) => {
        await sleep(state.delayMs);
        const record = records.get(id);
        if (record === undefined) throw notFound();
        return structuredClone(record);
      },
      update: async (id: string, fields: Record<string, unknown>) => {
        await sleep(state.delayMs);
        const record = records.get(id);
        if (record === undefined) throw notFound();
        Object.assign(record, fields);
        state.updateCalls.push({ id, fields });
        return structuredClone(record);
      },
      getFullList: async (options?: { filter?: string }) => {
        await sleep(state.delayMs);
        const filter = options?.filter ?? "";
        const wantsInterrupted =
          filter.includes('"pending"') && filter.includes('"running"');
        const rows = wantsInterrupted
          ? [...records.values()].filter(
              (record) =>
                record.status === "pending" || record.status === "running",
            )
          : [...records.values()];
        return rows.map((record) => structuredClone(record));
      },
    }),
  };

  return { state, client };
});

vi.mock("./pb.js", () => ({
  AUDITS_COLLECTION: "audits",
  getPocketBase: async () => h.client,
}));

const { AuditStoreError, failInterruptedAudits, fetchAudit, insertAudit, updateAudit } =
  await import("./store.js");

beforeEach(() => {
  h.state.records.clear();
  h.state.updateCalls.length = 0;
});

describe("insertAudit", () => {
  it("creates a pending record for the target url", async () => {
    const id = await insertAudit("https://example.com");

    const record = h.state.records.get(id);
    expect(record).toBeDefined();
    expect(record?.target_url).toBe("https://example.com");
    expect(record?.status).toBe("pending");
    expect(record?.payload).toEqual({});
  });

  it("wraps client failures in AuditStoreError", async () => {
    const failing = vi
      .spyOn(h.client, "collection")
      .mockReturnValueOnce({
        create: async () => {
          throw new Error("boom");
        },
      } as never);

    await expect(insertAudit("https://example.com")).rejects.toBeInstanceOf(
      AuditStoreError,
    );
    failing.mockRestore();
  });
});

describe("fetchAudit", () => {
  it("maps a record to an AuditRow", async () => {
    const id = await insertAudit("https://example.com");
    await updateAudit(id, { status: "running", current_step: "technical" });

    const row = await fetchAudit(id);
    expect(row).not.toBeNull();
    expect(row?.id).toBe(id);
    expect(row?.status).toBe("running");
    expect(row?.current_step).toBe("technical");
    expect(row?.target_url).toBe("https://example.com");
    expect(row?.completed_at).toBeNull();
    expect(row?.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns null for an unknown id", async () => {
    await expect(fetchAudit("doesnotexist000")).resolves.toBeNull();
  });
});

describe("updateAudit", () => {
  it("keeps scalar columns out of the payload", async () => {
    const id = await insertAudit("https://example.com");

    await updateAudit(id, {
      status: "running",
      niche: { category: "SaaS", location: "global", keywords: ["seo"] },
    });

    const record = h.state.records.get(id);
    expect(record?.status).toBe("running");
    expect(record?.niche).toBeUndefined();
    expect(record?.payload?.niche).toEqual({
      category: "SaaS",
      location: "global",
      keywords: ["seo"],
    });
  });

  it("merges new payload keys without dropping existing ones", async () => {
    const id = await insertAudit("https://example.com");

    await updateAudit(id, { niche: { category: "A", location: "B", keywords: [] } });
    await updateAudit(id, { competitors: [] });
    await updateAudit(id, { onpage_analysis: { score: 42 } as never });

    const payload = h.state.records.get(id)?.payload ?? {};
    expect(Object.keys(payload).sort()).toEqual([
      "competitors",
      "niche",
      "onpage_analysis",
    ]);
    expect((payload.niche as { category: string }).category).toBe("A");
  });

  it("serializes concurrent writes so parallel stages never lose keys", async () => {
    const id = await insertAudit("https://example.com");

    // The pipeline runs technical / ai_readiness / niche / performance in
    // parallel; each one read-merges the payload. Without the write queue the
    // last writer wins and earlier keys vanish.
    await Promise.all([
      updateAudit(id, { technical_analysis: { score: 70 } as never }),
      updateAudit(id, { ai_readiness_analysis: { score: 60 } as never }),
      updateAudit(id, { niche: { category: "C", location: "D", keywords: [] } }),
      updateAudit(id, { performance_analysis: { score: 50 } as never }),
    ]);

    const payload = h.state.records.get(id)?.payload ?? {};
    expect(Object.keys(payload).sort()).toEqual([
      "ai_readiness_analysis",
      "niche",
      "performance_analysis",
      "technical_analysis",
    ]);
  });

  it("is a no-op for an empty patch", async () => {
    const id = await insertAudit("https://example.com");
    const before = h.state.updateCalls.length;

    await updateAudit(id, {});

    expect(h.state.updateCalls.length).toBe(before);
  });

  it("wraps client failures in AuditStoreError", async () => {
    await expect(
      updateAudit("missing00000000", { status: "running" }),
    ).rejects.toBeInstanceOf(AuditStoreError);
  });
});

describe("failInterruptedAudits", () => {
  it("marks pending and running audits as failed and leaves the rest alone", async () => {
    const pendingId = await insertAudit("https://pending.example.com");
    const runningId = await insertAudit("https://running.example.com");
    await updateAudit(runningId, { status: "running", current_step: "technical" });
    const completedId = await insertAudit("https://done.example.com");
    await updateAudit(completedId, { status: "completed" });

    const recovered = await failInterruptedAudits("Interrupted by a restart");

    expect(recovered).toBe(2);
    expect(h.state.records.get(pendingId)?.status).toBe("failed");
    expect(h.state.records.get(runningId)?.status).toBe("failed");
    expect(h.state.records.get(runningId)?.current_step).toBe("");
    expect(h.state.records.get(runningId)?.error_message).toBe(
      "Interrupted by a restart",
    );
    expect(h.state.records.get(runningId)?.completed_at).toEqual(
      expect.any(String),
    );
    expect(h.state.records.get(completedId)?.status).toBe("completed");
    expect(h.state.records.get(completedId)?.error_message).toBeUndefined();
  });

  it("wraps client failures in AuditStoreError", async () => {
    const failing = vi.spyOn(h.client, "collection").mockReturnValueOnce({
      getFullList: async () => {
        throw new Error("boom");
      },
    } as never);

    await expect(failInterruptedAudits()).rejects.toBeInstanceOf(
      AuditStoreError,
    );
    failing.mockRestore();
  });
});
