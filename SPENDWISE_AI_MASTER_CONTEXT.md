# SpendWise AI --- Master Project Context

*Last updated: 4 November 2026*

> This document is the continuity reference for future SpendWise AI
> development, reviews, and planning conversations. Update it after
> meaningful implementation changes, approvals, or roadmap decisions.

## 1. Project overview

**SpendWise AI** is an AI-powered personal finance management and
spending-intelligence platform. It helps users organize financial
activity, understand spending patterns, identify unusual transactions,
track goals, and make better-informed financial decisions.

The project has progressed beyond a basic expense tracker. The current
priority is reliability, consistency, security, visual polish, and a
credible final-year project demonstration---not adding features without
a clear need.

### Core capabilities

-   Transaction management: add, edit, delete, and search transactions.
-   Statement import: import UPI/bank transaction CSV and XLSX files.
-   ML-based expense categorization.
-   Dashboard for income, expenses, and spending patterns.
-   Budget tracking and spending limits.
-   Recurring payment tracking.
-   AI-generated spending insights.
-   Anomaly detection.
-   AI financial assistant for questions about financial activity.
-   Savings goals and contribution tracking.
-   Financial calendar.
-   Downloadable CSV and PDF reports.
-   Alerts and notifications.
-   Expense forecasting.
-   What-if financial simulator.

## 2. Technology stack

### Frontend

-   React
-   TypeScript
-   Vite
-   Tailwind CSS v4
-   Motion
-   Recharts
-   Lucide

### Backend and database

-   Python
-   FastAPI
-   SQLAlchemy

### AI / ML

-   Scikit-learn
-   Transaction categorization
-   Anomaly detection
-   Expense forecasting

### Development workflow

-   VS Code
-   Antigravity
-   Git
-   Gemini

## 3. Current project status

### Phase summary

  -----------------------------------------------------------------------
  Phase                   Scope                   Status
  ----------------------- ----------------------- -----------------------
  Phase 1                 Foundation, project     Approved
                          structure, environment, 
                          frontend/backend setup  

  Phase 2                 Core financial          Approved
                          management,             
                          transactions, statement 
                          processing              

  Phase 3A--3D            Major application       Approved
                          features and supporting 
                          functionality           

  Phase 3E-1 and 3E-2     Reliability and         Addressed
                          consistency work        

  Phase 3E-3              Alert refresh /         Approved
                          notification            
                          consistency             

  Phase 3E-4              Savings contribution    Implementation
                          local-date fix          complete; final
                                                  read-only review
                                                  pending

  Phase 3E-5              Dialog error cleanup    Not started; next task
                                                  after 3E-4 approval

  Phase 3E final approval Consolidated            Pending
                          reliability review      

  Phase 4                 UI/UX polishing,        Upcoming
                          beginning with login    
                          redesign                

  Phase 5                 Integration, security,  Upcoming
                          and data-isolation      
                          review                  

  Phase 6                 End-to-end QA using     Upcoming
                          real Paytm statements   

  Phase 7                 Deployment,             Upcoming
                          documentation, and      
                          final-year presentation 
  -----------------------------------------------------------------------

### Reported test/build results

Antigravity previously reported: - Frontend tests: **407/407 passed** -
Backend tests: **223/223 passed** - Production build: **passed** - Git
commits created for the Phase 3E-4 task: **0**

These are Antigravity-reported results, not independently rerun or
verified in this conversation. Do not present them as independently
confirmed.

## 4. Exact current position --- Phase 3E-4

**Task:** Savings Contribution Local Date Fix\
**Status:** Implementation complete; formal approval pending.

### Problem

The contribution dialog previously used:

``` ts
new Date().toISOString().split('T')[0]
```

`toISOString()` uses UTC. In timezones ahead of UTC, the UTC calendar
date can differ from the user's local calendar date. For example, at
02:00 IST on November 5, UTC is still November 4. The default
contribution date should be November 5.

### Reported implementation

The implementation replaced the UTC-derived date with a local-date
utility using: - `getFullYear()` - `getMonth()` - `getDate()`

A dedicated test file was added.

### Files under review

1.  `frontend/src/features/goals/AddContributionDialog.tsx`
2.  `frontend/src/features/goals/AddContributionDialog.test.tsx`

### Final read-only review requested from Antigravity

The latest prompt asks Antigravity to inspect the actual code and test
quality without editing, creating, deleting, formatting, or committing
any files.

The review must establish:

1.  The exact `getTodayDateString` implementation.
2.  Whether the date default is initialized lazily and uses local
    calendar components.
3.  Whether manual date selection and API submission remain unchanged.
4.  The complete tests for UTC-boundary cases.
5.  Precisely how early-morning and late-night cases are constructed.
6.  Whether tests demonstrate a difference between local date and UTC
    date.
7.  Whether tests depend on the machine's timezone.
8.  Whether any test could pass even if the implementation used UTC.
9.  Month-end and year-end boundary coverage.
10. The final Git diff for both task files, including unrelated changes
    and any API/backend contract changes.

Illustrative cases to verify: - IST: November 5, 02:00 local time →
expected `2026-11-05`, while UTC date is November 4. - IST: November 4,
23:30 local time → expected `2026-11-04`. - Month-end and year-end
boundaries.

Antigravity's final response should answer: - Is the implementation
correct? - Are the timezone-boundary tests genuinely meaningful? - Are
any tests weak, redundant, or missing? - Is there a reason to request a
code change? - Final recommendation: **APPROVE** or **REQUEST TARGETED
CORRECTION**.

### Approval rule

Do not approve Phase 3E-4 merely because the implementation looks
correct or the test suite passes. Confirm that the tests genuinely
distinguish local calendar dates from UTC dates and that the diff is
scoped correctly.

**Do not start Phase 3E-5 until Phase 3E-4 has been formally approved.**

## 5. Locked roadmap --- do not skip phases

### Step 1 --- Finish Phase 3E-4

-   Review Antigravity's read-only report.
-   Verify the implementation and timezone-boundary test quality.
-   Check the final diff.
-   Record a formal APPROVE or REQUEST TARGETED CORRECTION decision.

### Step 2 --- Phase 3E-5: Dialog Error Cleanup

Planned scope: - Clear stale errors when delete dialogs close. - Clear
stale errors when cancel dialogs close. - Ensure errors do not
unexpectedly reappear when dialogs reopen. - Preserve existing dialog
behavior.

Do not broaden the scope without a demonstrated need.

### Step 3 --- Phase 3E final reliability approval

-   Review all completed reliability tasks.
-   Confirm no outstanding known issues.
-   Consolidate test and production-build evidence.
-   Record the final Phase 3E approval.

### Step 4 --- Phase 4: UI/UX polishing

First priority: redesign the login page.

Approved design direction: - Premium split-screen editorial fintech
layout. - Warm ivory/cream and forest-green identity. - Selective
emerald gradients and subtle glow. - Organic contour patterns. - DM
Serif Display headings and DM Sans UI. - Floating decorative financial
insight cards. - Smooth page-level animations. - Responsive mobile
layout and accessibility.

After the login page, polish registration, dashboard, and remaining
application pages consistently.

Do not begin Phase 4 before Phase 3E reliability approval.

### Step 5 --- Phase 5: Integration, security, and data isolation

-   Check frontend/backend integration.
-   Verify authentication and authorization.
-   Verify users cannot access one another's financial records.
-   Test important workflows and error cases.
-   Review API security and data handling.

### Step 6 --- Phase 6: End-to-end QA with real Paytm statements

Real statement testing is intentionally reserved for this phase.

-   Test actual Paytm statement imports.
-   Validate transaction parsing and categorization.
-   Verify duplicate prevention.
-   Check calculations, dashboards, reports, and insights against real
    data.
-   Fix issues discovered during real-world testing.

**Until Phase 6, continue using synthetic/sample data.**

### Step 7 --- Phase 7: Deployment and final-year presentation

-   Deployment and environment configuration.
-   Final documentation and setup instructions.
-   README and project architecture documentation.
-   Demo preparation.
-   Project presentation and explanation of AI/ML components.

## 6. Future feature backlog --- not current tasks

Consider these only after the locked roadmap: - Subscription and
spending-leak detector: identify forgotten subscriptions and recurring
spending. - Smarter transaction categorization: improve ML
classification accuracy. - Financial Data Quality / Trust Center:
explain data completeness, confidence, and reliability.

Do not start backlog features during the current Phase 3E review.

## 7. Working rules and decisions

1.  Preserve the existing project; do not restart or recreate completed
    work.
2.  Follow the locked roadmap in order. Do not skip phases.
3.  During Phase 3E, avoid unnecessary redesign and unrelated
    refactoring.
4.  Prioritize reliability and correctness over feature count.
5.  Use synthetic/sample data until Phase 6.
6.  Treat Antigravity summaries and test counts as reported evidence
    until independently verified.
7.  For review tasks, prefer read-only inspection and targeted evidence.
8.  Do not modify files when a prompt explicitly requests a read-only
    review.
9.  Before suggesting code changes, identify the exact defect and
    smallest justified correction.
10. Keep API contracts and backend date handling unchanged unless a
    verified requirement demands otherwise.
11. After each task, record changed files, tests run, build results,
    diff scope, and approval status.
12. Keep Antigravity reports concise. Aim for no more than 500 words,
    with file paths and line numbers instead of large pasted code
    blocks.

## 8. Efficient ChatGPT / Antigravity handover workflow

To reduce repeated context-window exhaustion:

-   Keep this file as the canonical project handover document in the
    repository.
-   Ask Antigravity for concise summaries (ideally 500 words or fewer).
-   Share only the relevant report, exact diff, failing test output, or
    specific code excerpt---not the entire development history.
-   Update this file after meaningful phase approvals, roadmap changes,
    or architectural decisions.
-   When starting a fresh ChatGPT conversation, attach this file and
    say:\
    **"Continue SpendWise AI from this master context. Preserve the
    locked roadmap and current approval state. Do not repeat completed
    work."**

### Suggested concise Antigravity report format

``` text
Task and status:
Files inspected/changed:
Implementation findings:
Tests and exact results:
Edge cases covered/missing:
Git diff findings:
Known issues:
Recommendation: APPROVE / REQUEST TARGETED CORRECTION
```

## 9. Immediate next action

**Wait for the Antigravity Phase 3E-4 read-only review report.**

When it is shared: 1. Evaluate the implementation and tests critically.
2. Check whether the tests prove local-date behavior rather than merely
formatting dates. 3. Check the timezone assumptions and edge cases. 4.
Check the diff scope and API/backend invariants. 5. Decide APPROVE or
REQUEST TARGETED CORRECTION.

Only after formal Phase 3E-4 approval should Phase 3E-5 begin.

------------------------------------------------------------------------

*End of current master context.*
