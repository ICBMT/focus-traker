# Keyboard and mouse rhythm experiment

**Status:** requested by the user on 2026-11-19, then authorized for implementation. An own-test-pad-only five-bin keyboard cadence comparison and optional pointer/editing counts now exist; see [IMPLEMENTATION.md](IMPLEMENTATION.md). No global monitor, pointer movement-style model, or validated boredom/mood/flow inference exists. Features beyond that scoped lab remain target design/research.

**Goal:** investigate whether changes in a person's interaction style help the app avoid interrupting steady work and offer a useful check-in when their work rhythm changes.

**Product language:** measure **input rhythm**, not a person's mood, productivity, or psychological flow. “Bored,” “in the zone,” and similar labels come from voluntary user feedback; sensor-only output stays **steady / changed / unknown**.

Related: [product plan](PLAN.md), [architecture](ARCHITECTURE.md), [platform limits](PLATFORM_SUPPORT.md), [privacy](PRIVACY_AND_SAFETY.md), and [research R26–R27](RESEARCH.md#r26--typing-dynamics-justify-an-experiment-not-a-mood-detector).

## 1. What this adds

Idle time answers “has input been observed recently?” The optional rhythm experiment asks “has the pattern changed relative to this person's comparable work?” It must also work without a camera or LLM when permitted input signals are available.

Use three separate levels:

1. **Observation:** typing bursts became shorter, pauses increased, or pointer-active time changed.
2. **Hypothesis:** the work rhythm may have changed; cause unknown.
3. **User confirmation:** “I'm thinking,” “I'm bored/stuck,” “I'm in the zone,” “Taking a break,” or dismiss.

Do not collapse these into a guessed emotion. A stable rhythm can coexist with boredom; little input can be concentrated reading. A self-reported state is subjective feedback, not a clinical ground-truth label.

## 2. Candidate features and their limits

All features below are proposed experiments, separately capability-gated and disabled when there are too few valid observations. Thresholds, bins, and window lengths need measurement.

| Feature family | Minimal proposed summary | Important limitation |
| --- | --- | --- |
| Keyboard cadence | Coarse histogram of intervals between presses, derived immediately in the native adapter | No per-key timing sequence, key-pair features, or comparison of different languages/tasks as equivalent |
| Bursts and pauses | Active fraction, coarse burst lengths, short/long pause counts | A pause can be thought, reading, a meeting, or an observation gap—not boredom |
| Editing-key activity | Optional aggregate Backspace/Delete count or proportion | Classify only this category in the native callback; it is not an error rate, and ordinary editing/held keys/remapping can distort it |
| Pointer activity | Active fraction and coarse movement/idle, click, and scroll counts | Trackpad and mouse behavior differ; no page/app identity or semantic meaning is available |
| Pointer movement style | Optional coarse speed/change buckets using only the immediately previous position/time | Device settings, acceleration, DPI, and monitor layout confound comparison; no saved trajectories or tremor/health interpretation |
| Keyboard/pointer balance | Aggregate active-time proportions and transitions between coarse activity buckets | Editing versus reading or selecting objects changes this without a mood change |

Exclude key-hold/digraph/trigraph signatures, exact cursor paths, text reconstruction, application/window titles, clipboard, and personal identity models from this first experiment. Do not copy a paper's reported accuracy when that paper uses richer or more sensitive features than this design permits.

## 3. Privacy-preserving extraction contract

```text
Optional permitted native events
  -> tiny local accumulator; discard event details immediately
  -> bounded/coarsened feature window + coverage + validity
  -> per-work-style baseline comparison in Rust
  -> rhythm = steady | changed | unknown
  -> existing deterministic policy and optional user feedback
```

- Global rhythm monitoring is **off by default** and consent is separate from idle summaries and camera use. Editing-key counts and pointer-style features can be declined independently.
- Native APIs may transiently deliver key codes and coordinates. Do not decode characters, build a per-key map, buffer an event stream, or forward individual events to the domain, UI, logs, database, or an LLM.
- A constant-size accumulator may retain the immediately previous keyboard-press time and, if enabled, one previous pointer position/time to update histograms/counters. Overwrite each on the next relevant event; clear on pause/gap/reset. No per-key/device map, raw trace, or per-event array is allowed.
- Start by testing roughly 30-second coarse summaries and at most two minutes of rolling summary windows. This is a privacy/performance hypothesis, not an optimal detector setting. Baselines retain only bounded aggregate statistics, not a sequence of past windows.
- Each summary declares observed duration, sample sufficiency, capture generation, algorithm version, feature availability, and invalidation reasons. An absent event listener is not a zero-activity sample.
- Treat native secure-input restrictions, missing repeat markers, assistive/IME input, event coalescing, and uncertain device changes as capability/quality limitations. Disable affected metrics rather than inventing observations or requesting broader access.
- A global observer cannot promise to identify every password/private field in another app. Explain that aggregates can include such activity where the OS delivers it; do not scrape fields to detect it. Users needing strict exclusion should keep global rhythm off and use idle/manual mode.
- No rhythm features, personal baselines, or raw events go to a model/provider. AI may receive a generic user-approved request for a check-in, not automatic behavioral measurements.
- No history of rhythm windows by default. Baselines/feedback are session-only unless the user explicitly saves a small local profile; deletion/reset is available. Optional minute-count history does not authorize saving interval histograms.

Minimal domain output:

```text
InputRhythmSnapshot
  generation, window_end, observed_duration
  available_features, sufficient_samples, invalid_reasons
  baseline_status, work_style, algorithm_version
  rhythm: Unknown | Steady | Changed
  reason_codes[]
```

Bound all fields. Coarse feature summaries may enter the Rust feature engine but not ordinary history/telemetry. Do not put a guessed `mood` field in the adapter contract or expose an uncalibrated probability of boredom/flow.

## 4. Personalization and decision rules

1. **Separate work contexts:** use the user's chosen coding/writing, reading, creative, or meeting mode. No automatic document/app inspection. Unknown/new contexts start with unknown rhythm.
2. **Cold start:** guided practice can check signal availability; a short calibration does not establish a reliable boredom/flow baseline. Collect sufficient comparable voluntary sessions before interpreting a deviation. Set minimum sample/coverage criteria during F07.
3. **Robust comparison:** start with simple within-person summary distributions and sustained-deviation rules. No cloud training, large emotion model, or custom neural network is needed for the first experiment.
4. **Avoid baseline drift:** freeze baseline updates during suspected changes; refresh/recalibrate explicitly after task/device/input-method changes. Do not silently learn “tired” or “bored” as normal.
5. **Use feedback carefully:** allow quick self-labels and corrections at session boundaries. Optional check-ins are opt-in, low-frequency, and subject to the existing nudge cap; no periodic modal surveys during protected focus.
6. **Do not double-count evidence:** cadence, pauses, and burstiness are correlated descriptions of the same input stream, not three independent sensors. Adding a webcam does not automatically validate the interpretation.

Possible product behavior after validation:

| Situation | Permitted response |
| --- | --- |
| User has protected focus; comparable rhythm looks steady | Avoid our own discretionary interruption; preserve explicit timers and urgent-source rules |
| Sustained rhythm change, adequate coverage, eligible task, no override | Optional quiet check-in: “Still working, or would a short reset help?” |
| User says bored/stuck | Offer a small next task, optional finite game/chat, or screen-free break |
| User says reading/thinking/in the zone | Honor that choice, suppress adaptive prompts for the configured interval, and allow later correction |
| Sparse, conflicting, missing, or unfamiliar input | Unknown; timer/manual behavior only |

Input rhythm alone never authorizes native locking, a mandatory break, opening a game, disabling access, or hiding a potentially important notification. Do not interpret rapid typing as good work or slow typing as poor work.

## 5. Platform scope

- **Wayland:** no assumed portable global event feed. If the desktop exposes only idle state, rhythm metrics stay unavailable. No root, `input` group, device-grab, or InputCapture workaround.
- **X11, Windows, macOS:** candidate passive event adapters require native permission/lifecycle tests; macOS may require Input Monitoring. Probe each feature rather than assuming all listeners expose repeat/device/secure-input behavior consistently.
- **Own-window demo:** useful for checking extraction and privacy invariants, but label it own-window-only. It does not prove that we can observe ordinary work in other apps, especially on Wayland.
- Preserve usable sessions, self-reports, and camera-free/AI-free modes on every platform. A desktop companion requiring extra privilege/maintenance needs its own proposal.

See [PLATFORM_SUPPORT.md](PLATFORM_SUPPORT.md) and research R07–R09/R15 for native boundaries.

## 6. Delivery and validation gate

- **M0/F07:** time-box extraction/privacy/capability feasibility to 2–3 engineering days initially. Use synthetic input and at least one authorized native path; document untested platforms rather than simulating a success. A longer study is separate work, not part of this time box.
- **M2/P06:** if F07 passes, add opt-in observation-only rhythm summaries, baseline/reset controls, and optional self-labels. No guessed mood dashboard or adaptive enforcement.
- **M3:** optionally compare input-only and camera-assisted observations without making the rhythm experiment depend on camera permission.
- **M6:** enable a gentle input-informed check-in only if the usefulness/privacy gate passes. Otherwise keep the feature observation-only or omit it.

Required validation:

- Compare timer-only, idle-only, rhythm-only, and optional combined-sensor behavior using the **same privacy-limited features that would ship**.
- Include coding, writing, reading, debugging, unfamiliar tasks, ordinary editing/deletions, repetitive input, meetings, assistive/IME input, multiple devices, and changed DPI/monitor setups.
- Evaluate changes against voluntary check-ins for **this person and context**, not presumed emotion from an induced task. Report missing labels and response/selection bias.
- Hold out entire later sessions/days; overlapping windows from the same period must not appear in both training and test sets. If evaluating cross-user models later, keep users disjoint too.
- Report false/undesired check-ins per working hour, missed user-requested help, unknown coverage, user-rated helpfulness, and any interruption of self-reported steady work. A forced classification/accuracy number alone is not enough.
- Test bounded memory, no raw-data artifacts, minimum sample thresholds, stale/reordered events, pause/revoke, secure-input gaps, held-key/repeat behavior, lost events, device switches, and permission failures.

**Ship gate:** demonstrate useful incremental benefit over idle/timer baselines without violating privacy limits or increasing unwanted interruptions. No benefit means no adaptive check-in. Positive results still do not justify advertising automatic boredom, mood, or psychological-flow identification.
