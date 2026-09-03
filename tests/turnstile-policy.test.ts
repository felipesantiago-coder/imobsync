import { describe, expect, it } from "vitest";
import {
  classifySiteverifyCodes,
  TURNSTILE_HARD_CODES,
} from "@/lib/turnstile-policy";

/**
 * Caracterização da política de enforcement do Turnstile:
 * hard = falha por conteúdo do token → bloqueia (fail-closed)
 * soft = infraestrutura/desconhecido → fail-open (disponibilidade)
 */
describe("classifySiteverifyCodes — política Turnstile", () => {
  it("classifica invalid-input-response como hard (token forjado/adulterado)", () => {
    expect(classifySiteverifyCodes(["invalid-input-response"])).toBe("hard");
  });

  it("classifica timeout-or-duplicate como hard (token expirado/reutilizado)", () => {
    expect(classifySiteverifyCodes(["timeout-or-duplicate"])).toBe("hard");
  });

  it("qualquer combinação contendo código hard permanece hard", () => {
    expect(
      classifySiteverifyCodes(["internal-error", "timeout-or-duplicate"])
    ).toBe("hard");
    expect(
      classifySiteverifyCodes([
        "invalid-input-secret",
        "invalid-input-response",
      ])
    ).toBe("hard");
  });

  it("classifica invalid-input-secret como soft (misconfig — bloquear trancaria todos)", () => {
    expect(classifySiteverifyCodes(["invalid-input-secret"])).toBe("soft");
  });

  it("classifica missing-input-secret como soft", () => {
    expect(classifySiteverifyCodes(["missing-input-secret"])).toBe("soft");
  });

  it("classifica internal-error como soft (falha transitória do Cloudflare)", () => {
    expect(classifySiteverifyCodes(["internal-error"])).toBe("soft");
  });

  it("classifica missing-input-response como soft (contrato, não veredicto)", () => {
    expect(classifySiteverifyCodes(["missing-input-response"])).toBe("soft");
  });

  it("classifica códigos desconhecidos como soft (default conservador de disponibilidade)", () => {
    expect(classifySiteverifyCodes(["future-unknown-code-9999"])).toBe("soft");
    expect(classifySiteverifyCodes(["bad-request"])).toBe("soft");
  });

  it("payload malformado (não-array) é soft — nunca bloqueia por dado inesperado", () => {
    expect(classifySiteverifyCodes(undefined)).toBe("soft");
    expect(classifySiteverifyCodes(null)).toBe("soft");
    expect(classifySiteverifyCodes("invalid-input-response")).toBe("soft");
    expect(classifySiteverifyCodes({ code: "invalid-input-response" })).toBe(
      "soft"
    );
    expect(classifySiteverifyCodes([])).toBe("soft");
  });

  it("contrato: lista de códigos hard documentada", () => {
    expect(TURNSTILE_HARD_CODES).toEqual([
      "invalid-input-response",
      "timeout-or-duplicate",
    ]);
  });
});
