"use client";

/**
 * Beneficiary list editing.
 *
 * Used by the creation wizard and the beneficiary management page. It owns the
 * allocation invariant (exactly 100%) on the client; the contract re-enforces
 * the same rule authoritatively.
 */

import { useCallback, useMemo, useState } from "react";

import { totalAllocationBps } from "@/lib/vault/calculations";
import { generateId } from "@/lib/vault/repository";
import {
  autoBalanceBeneficiaries,
  LIMITS,
  validateBeneficiaries,
  type ValidationResult,
} from "@/lib/vault/validation";
import { TOTAL_ALLOCATION_BPS, type Beneficiary } from "@/lib/vault/types";

export function createBeneficiary(overrides: Partial<Beneficiary> = {}): Beneficiary {
  return {
    id: generateId("bene"),
    address: "",
    allocationBps: 0,
    ...overrides,
  };
}

export interface UseBeneficiariesResult {
  beneficiaries: Beneficiary[];
  totalBps: number;
  /** 10000 - totalBps. Negative when over-allocated. */
  remainingBps: number;
  /** True when the set is complete and sums to exactly 100%. */
  balanced: boolean;
  validation: ValidationResult;
  canAdd: boolean;
  add: (overrides?: Partial<Beneficiary>) => Beneficiary;
  update: (id: string, patch: Partial<Beneficiary>) => void;
  remove: (id: string) => void;
  setAllocationPercent: (id: string, percent: number) => void;
  autoBalance: () => void;
  reset: (next: Beneficiary[]) => void;
}

export function useBeneficiaries(initial: Beneficiary[] = []): UseBeneficiariesResult {
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>(initial);

  const validation = useMemo(() => validateBeneficiaries(beneficiaries), [beneficiaries]);
  const totalBps = useMemo(() => totalAllocationBps(beneficiaries), [beneficiaries]);

  const add = useCallback((overrides: Partial<Beneficiary> = {}) => {
    const beneficiary = createBeneficiary(overrides);
    setBeneficiaries((current) =>
      current.length >= LIMITS.maxBeneficiaries ? current : [...current, beneficiary],
    );
    return beneficiary;
  }, []);

  const update = useCallback((id: string, patch: Partial<Beneficiary>) => {
    setBeneficiaries((current) =>
      current.map((beneficiary) => (beneficiary.id === id ? { ...beneficiary, ...patch } : beneficiary)),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setBeneficiaries((current) => current.filter((beneficiary) => beneficiary.id !== id));
  }, []);

  const setAllocationPercent = useCallback((id: string, percent: number) => {
    const bps = Number.isFinite(percent)
      ? Math.max(0, Math.min(TOTAL_ALLOCATION_BPS, Math.round(percent * 100)))
      : 0;
    setBeneficiaries((current) =>
      current.map((beneficiary) =>
        beneficiary.id === id ? { ...beneficiary, allocationBps: bps } : beneficiary,
      ),
    );
  }, []);

  const autoBalance = useCallback(() => {
    setBeneficiaries((current) => autoBalanceBeneficiaries(current));
  }, []);

  const reset = useCallback((next: Beneficiary[]) => {
    setBeneficiaries(next);
  }, []);

  return {
    beneficiaries,
    totalBps,
    remainingBps: TOTAL_ALLOCATION_BPS - totalBps,
    balanced: totalBps === TOTAL_ALLOCATION_BPS,
    validation,
    canAdd: beneficiaries.length < LIMITS.maxBeneficiaries,
    add,
    update,
    remove,
    setAllocationPercent,
    autoBalance,
    reset,
  };
}
