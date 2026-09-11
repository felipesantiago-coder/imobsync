import { describe, expect, it } from "vitest";
import {
  emailVariantsForQuery,
  resolveUniqueUserByEmail,
  type EmailUserMatch,
} from "../src/lib/mp-user-resolution";

const users: EmailUserMatch[] = [
  { id: "11111111-1111-4111-8111-111111111111", email: "joao@example.com" },
  { id: "22222222-2222-4222-8222-222222222222", email: "maria@example.com" },
];

describe("resolveUniqueUserByEmail (webhook Mercado Pago)", () => {
  it("associa quando há exatamente 1 correspondência", () => {
    expect(resolveUniqueUserByEmail(users, "joao@example.com")).toEqual({
      kind: "found",
      userId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("comparação case-insensitive (MP pode enviar com caixa diferente)", () => {
    expect(resolveUniqueUserByEmail(users, "MARIA@Example.com")).toEqual({
      kind: "found",
      userId: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("e-mail desconhecido → não associa (kind none)", () => {
    expect(resolveUniqueUserByEmail(users, "desconhecido@example.com")).toEqual({ kind: "none" });
  });

  it("AMBIGUIDADE: dois usuários com o mesmo e-mail → NÃO escolhe o primeiro", () => {
    const ambiguous: EmailUserMatch[] = [
      { id: "11111111-1111-4111-8111-111111111111", email: "duplo@example.com" },
      { id: "33333333-3333-4333-8333-333333333333", email: "duplo@example.com" },
    ];
    expect(resolveUniqueUserByEmail(ambiguous, "duplo@example.com")).toEqual({ kind: "ambiguous" });
  });

  it("linhas duplicadas do MESMO id não contam como ambiguidade", () => {
    const same: EmailUserMatch[] = [
      { id: "11111111-1111-4111-8111-111111111111", email: "joao@example.com" },
      { id: "11111111-1111-4111-8111-111111111111", email: "joao@example.com" },
    ];
    expect(resolveUniqueUserByEmail(same, "joao@example.com")).toEqual({
      kind: "found",
      userId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("e-mail nulo no registro nunca casa", () => {
    const withNull: EmailUserMatch[] = [{ id: users[0].id, email: null }];
    expect(resolveUniqueUserByEmail(withNull, "joao@example.com")).toEqual({ kind: "none" });
  });
});

describe("emailVariantsForQuery", () => {
  it("uma variante quando já está em minúsculas", () => {
    expect(emailVariantsForQuery("joao@example.com")).toEqual(["joao@example.com"]);
  });

  it("duas variantes quando há maiúsculas (evita ilike e curingas de '_')", () => {
    expect(emailVariantsForQuery("Joao_Silva@Example.com")).toEqual([
      "Joao_Silva@Example.com",
      "joao_silva@example.com",
    ]);
  });
});
