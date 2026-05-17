/**
 * Yujin Forge -- migration types.
 *
 * AuditReport is the JSON shape emitted by `yf migrate --audit`.
 * Stable across versions: the apply step (later milestone) reads
 * the same structure and renders diffs against it.
 */

export type CandidateKind = 'action' | 'field' | 'region';

export interface Candidate {
  /** Path relative to the project root, posix-style. */
  file: string;
  /** 1-based line number where the JSX element opens. */
  line: number;
  /** Role NAC-3 would assign. */
  kind: CandidateKind;
  /** Tag name (e.g. 'button', 'input', 'a'). */
  element: string;
  /** Suggested data-nac-id, derived from file path + role. */
  proposed_id: string;
  /**
   * True when the element already carries a data-nac-id attribute.
   * The audit lists these so the apply step knows what to skip.
   */
  already_tagged: boolean;
}

export interface AuditSummary {
  actions:        number;
  fields:         number;
  regions:        number;
  already_tagged: number;
  total:          number;
}

export interface AuditReport {
  /** Scan timestamp. */
  generated_at: string;
  /** Project root, absolute path. */
  project_root: string;
  /** How many .tsx/.jsx files were walked. */
  scanned_files: number;
  /** Per-file candidate counts. */
  candidates: Candidate[];
  /** Aggregate counters. */
  summary: AuditSummary;
}
