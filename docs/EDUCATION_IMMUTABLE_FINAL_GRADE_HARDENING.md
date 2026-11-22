# ETERNYX Education — append-only official grades and finalized-answer integrity

**Status: staging SQL + disposable PostgreSQL tests only; NOT DEPLOYED to hosted staging or production.**

## Why this milestone matters

The existing Education atomic finalizer, written-review freeze and private student receipt already check that graders cannot accidentally duplicate a final grade and that normal browser roles cannot edit the grade ledger. However, a privileged SQL operation could still alter or delete official grade rows and thereby invalidate the promise of an immutable result.

This change closes those ordinary SQL mutation paths with explicit PostgreSQL triggers while preserving the genuine trusted grading transaction.

## Integrity rules installed by this reviewed staging script

1. **Append-only final-grade ledger.** Any row UPDATE or DELETE is rejected, even if values would remain unchanged.
2. **Finalized attempt freeze.** Once an official ledger entry exists, any attempt UPDATE or DELETE is rejected. That includes edited scores, rollback to in-progress, adjusted timing, reassigned identity and no-op updates.
3. **Finalized answer freeze.** Inserts, updates and deletes involving an already-finalized attempt are forbidden. This prevents new late answers, changed option selections, rewritten written responses, changed points and forged correctness.
4. **Transactional race protection.** Answer changes obtain the parent attempt's row lock before checking whether it has been officially finalized. The trusted service already locks the parent before writing answer/attempt grades and inserting the final ledger, so competing answer writes must wait for the finalization decision.
5. **Bulk-erasure protection.** BEFORE TRUNCATE triggers on the ledger, attempts and answers reject mass truncation when official finalized results exist; row-level triggers alone would not cover TRUNCATE.
6. **Reviewed written marks stay frozen.** The pre-existing review trigger remains installed; deleting or replacing marks after finalization is independently challenged by tests.
7. **Trusted grading still works.** Before official ledger insertion, the original atomic finalizer can update genuine scored answers and the attempt. After finalization it returns the prior official result without writing again.
8. **Active students are not blocked.** A still-in-progress attempt can be updated by trusted database paths without a final ledger entry.
9. **Safe learner receipt unchanged.** The owner-only five-field verified grade remains available and accurate.
10. **Guard helpers are private.** Trigger functions are not directly executable by anonymous, authenticated or service roles; the current database owner retains trigger execution authority.

## Real PostgreSQL acceptance, not just string tests

The existing Education SQL CI creates a disposable PostgreSQL 17 instance with **network disabled**, applies the existing authorization, CBT, review, official grade and verified-result functions, runs previous adversarial and concurrency acceptance, then applies this hardening. It **immediately performs a legitimate complete three-question instructor-to-student exam and atomic 6/10 grading while the locks are installed**.

After that, **23 additional real SQL assertions** intentionally attempt owner-level ledger score editing/deletion/truncation, attempt status and grade rewriting, forged or late answer insertion, score/correctness tampering, written-review mutations and bulk erasure. They confirm that ongoing exams remain usable, finalizer retry remains idempotent, Student A's real final receipt remains visible, and none of the failed attacks changed canonical grade data. Twenty offline regression tests verify source, safety and workflow ordering.

## Deployment and retention limitations

This file lives in `scripts/sql/staging-education-immutable-final-grade-records.sql`, **not** in automatically executed migrations. Nothing is deployed merely by merging. To use it, obtain separate staging owner approval, verify the existing Education scripts are deployed in order, audit the live PostgreSQL schema, RLS, owners, constraints, trigger registration and function grants, then apply under a supervised, reversible staging deployment plan before considering any production change.

**Database superusers or table owners who can disable/drop triggers are outside this protection boundary.** The operational security model must still protect database administration, migration credentials and backups. This is not cryptographic immutability or an append-only external audit service.

**Privacy and erasure:** these locks intentionally block routine deletion of finalized exam evidence, including foreign-key cascades. Before production use, create a separately reviewed privacy retention, personal-data deletion and legal erasure workflow that can deliberately reconcile or anonymize records under audited authority. Do not silently bypass triggers, erase real students, or disable the protection merely to pass tests. Backup restore, historical grade reconciliation, regrading/appeals and production incident processes also require explicit policies.

The older adversarial verified-result fixture intentionally modifies grade/attempt values to prove the reader **fails closed** on inconsistencies. The pipeline therefore installs the new immutability protection **after** those tests, then proves a fresh legitimate exam still finalizes properly. This avoids weakening existing negative acceptance.

**No hosted Supabase writes, production changes, billing, paid inference, or infrastructure provisioning occur in this PR.**
