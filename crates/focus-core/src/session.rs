use serde::{Deserialize, Serialize};

const MINUTE: u64 = 60_000;
const MAX_FOCUS: u64 = 180 * MINUTE;
const MAX_BREAK: u64 = 30 * MINUTE;
const MAX_GAP: u64 = 15_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Phase {
    Idle,
    Focus,
    Paused,
    BreakReady,
    Break,
    BreakPaused,
    Complete,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WorkStyle {
    Deep,
    Reading,
    Creative,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartOptions {
    pub id: String,
    pub task: String,
    pub mode: WorkStyle,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Snapshot {
    pub id: Option<String>,
    pub phase: Phase,
    pub task: String,
    pub mode: WorkStyle,
    pub focus_duration_ms: u64,
    pub break_duration_ms: u64,
    pub remaining_ms: u64,
    pub focus_elapsed_ms: u64,
    pub break_elapsed_ms: u64,
    pub started_at: Option<u64>,
    pub break_started_at: Option<u64>,
    pub interrupted: bool,
}

impl Default for Snapshot {
    fn default() -> Self {
        Self {
            id: None,
            phase: Phase::Idle,
            task: String::new(),
            mode: WorkStyle::Deep,
            focus_duration_ms: 25 * MINUTE,
            break_duration_ms: 5 * MINUTE,
            remaining_ms: 25 * MINUTE,
            focus_elapsed_ms: 0,
            break_elapsed_ms: 0,
            started_at: None,
            break_started_at: None,
            interrupted: false,
        }
    }
}

#[derive(Default)]
pub struct SessionEngine {
    state: Snapshot,
    last_clock: Option<(u64, u64)>,
}

impl SessionEngine {
    pub fn reset(&mut self) -> Snapshot {
        self.state = Snapshot::default();
        self.last_clock = None;
        self.snapshot()
    }

    pub fn snapshot(&self) -> Snapshot {
        self.state.clone()
    }

    pub fn tick(&mut self, mono: u64, wall: u64) {
        let previous = self.last_clock.replace((mono, wall));
        if !matches!(self.state.phase, Phase::Focus | Phase::Break) {
            return;
        }
        let Some((last_mono, last_wall)) = previous else {
            return;
        };
        let elapsed = mono.saturating_sub(last_mono);
        if mono < last_mono || elapsed > MAX_GAP || wall.abs_diff(last_wall) > MAX_GAP {
            self.state.phase = if self.state.phase == Phase::Focus {
                Phase::Paused
            } else {
                Phase::BreakPaused
            };
            self.state.interrupted = true;
            return;
        }
        let consumed = elapsed.min(self.state.remaining_ms);
        self.state.remaining_ms -= consumed;
        if self.state.phase == Phase::Focus {
            self.state.focus_elapsed_ms += consumed;
        } else {
            self.state.break_elapsed_ms += consumed;
        }
        if self.state.remaining_ms == 0 {
            self.state.phase = if self.state.phase == Phase::Focus {
                Phase::BreakReady
            } else {
                Phase::Complete
            };
        }
    }

    pub fn start(
        &mut self,
        options: StartOptions,
        mono: u64,
        wall: u64,
    ) -> Result<Snapshot, String> {
        if !matches!(self.state.phase, Phase::Idle | Phase::Complete) {
            return Err("Finish the current session before starting another.".into());
        }
        if options.id.is_empty()
            || options.id.encode_utf16().count() > 80
            || options.task.trim().is_empty()
            || options.task.trim().encode_utf16().count() > 160
        {
            return Err("Choose an intention between 1 and 160 characters.".into());
        }
        if !(MINUTE..=MAX_FOCUS).contains(&options.duration_ms) {
            return Err("Choose a duration between 1 and 180 minutes.".into());
        }
        self.state = Snapshot {
            id: Some(options.id),
            task: options.task.trim().into(),
            mode: options.mode,
            phase: Phase::Focus,
            focus_duration_ms: options.duration_ms,
            remaining_ms: options.duration_ms,
            started_at: Some(wall),
            ..Snapshot::default()
        };
        self.last_clock = Some((mono, wall));
        Ok(self.snapshot())
    }

    pub fn pause(&mut self, mono: u64, wall: u64) -> Snapshot {
        self.tick(mono, wall);
        self.state.phase = match self.state.phase {
            Phase::Focus => Phase::Paused,
            Phase::Break => Phase::BreakPaused,
            other => other,
        };
        self.snapshot()
    }

    pub fn resume(&mut self, mono: u64, wall: u64) -> Snapshot {
        self.state.phase = match self.state.phase {
            Phase::Paused => Phase::Focus,
            Phase::BreakPaused => Phase::Break,
            other => other,
        };
        self.state.interrupted = false;
        self.last_clock = Some((mono, wall));
        self.snapshot()
    }

    pub fn finish(&mut self, mono: u64, wall: u64) -> Snapshot {
        self.tick(mono, wall);
        if self.state.phase != Phase::Idle {
            self.state.phase = Phase::Complete;
        }
        self.state.interrupted = false;
        self.snapshot()
    }

    pub fn start_break(
        &mut self,
        id: String,
        duration_ms: u64,
        mono: u64,
        wall: u64,
    ) -> Result<Snapshot, String> {
        if !(20_000..=MAX_BREAK).contains(&duration_ms)
            || id.is_empty()
            || id.encode_utf16().count() > 80
        {
            return Err("Choose a break between 20 seconds and 30 minutes.".into());
        }
        self.tick(mono, wall);
        if matches!(self.state.phase, Phase::Break | Phase::BreakPaused) {
            return Err("A break is already in progress.".into());
        }
        if matches!(self.state.phase, Phase::Idle | Phase::Complete) {
            self.state = Snapshot {
                id: Some(id),
                task: "A moment to reset".into(),
                started_at: Some(wall),
                ..Snapshot::default()
            };
        }
        self.state.phase = Phase::Break;
        self.state.break_duration_ms = duration_ms;
        self.state.remaining_ms = duration_ms;
        self.state.break_elapsed_ms = 0;
        self.state.break_started_at = Some(wall);
        self.state.interrupted = false;
        self.last_clock = Some((mono, wall));
        Ok(self.snapshot())
    }

    pub fn restore(
        &mut self,
        snapshot: Snapshot,
        mono: u64,
        wall: u64,
    ) -> Result<Snapshot, String> {
        if !matches!(self.state.phase, Phase::Idle | Phase::Complete) {
            return Err("A session is already active.".into());
        }
        if !matches!(
            snapshot.phase,
            Phase::Focus | Phase::Paused | Phase::Break | Phase::BreakPaused | Phase::BreakReady
        ) || snapshot
            .id
            .as_ref()
            .is_none_or(|id| id.is_empty() || id.encode_utf16().count() > 80)
            || snapshot.task.encode_utf16().count() > 160
            || !(MINUTE..=MAX_FOCUS).contains(&snapshot.focus_duration_ms)
            || !(20_000..=MAX_BREAK).contains(&snapshot.break_duration_ms)
            || snapshot.task.trim().is_empty()
            || snapshot.remaining_ms > MAX_FOCUS
            || snapshot.focus_elapsed_ms > snapshot.focus_duration_ms
            || snapshot.break_elapsed_ms > snapshot.break_duration_ms
            || snapshot.started_at.is_none_or(|t| {
                t < wall.saturating_sub(30 * 86_400_000) || t > wall.saturating_add(86_400_000)
            })
            || snapshot.break_started_at.is_some_and(|t| {
                t < wall.saturating_sub(30 * 86_400_000) || t > wall.saturating_add(86_400_000)
            })
        {
            return Err("The saved session could not be recovered safely.".into());
        }
        let resting = matches!(snapshot.phase, Phase::Break | Phase::BreakPaused);
        if (resting
            && (snapshot.break_started_at.is_none()
                || snapshot.remaining_ms + snapshot.break_elapsed_ms != snapshot.break_duration_ms))
            || (!resting
                && (snapshot.break_started_at.is_some()
                    || snapshot.break_elapsed_ms != 0
                    || snapshot.remaining_ms + snapshot.focus_elapsed_ms
                        != snapshot.focus_duration_ms))
            || (snapshot.phase == Phase::BreakReady && snapshot.remaining_ms != 0)
        {
            return Err("The saved session could not be recovered safely.".into());
        }
        let phase = match snapshot.phase {
            Phase::Break | Phase::BreakPaused => Phase::BreakPaused,
            Phase::BreakReady => Phase::BreakReady,
            _ => Phase::Paused,
        };
        self.state = Snapshot {
            phase,
            interrupted: true,
            ..snapshot
        };
        self.last_clock = Some((mono, wall));
        Ok(self.snapshot())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn start(engine: &mut SessionEngine) {
        engine
            .start(
                StartOptions {
                    id: "test".into(),
                    task: "Write a paragraph".into(),
                    mode: WorkStyle::Deep,
                    duration_ms: MINUTE,
                },
                0,
                1_000_000,
            )
            .unwrap();
    }

    #[test]
    fn pauses_do_not_count_as_work() {
        let mut engine = SessionEngine::default();
        start(&mut engine);
        engine.pause(5_000, 1_005_000);
        engine.tick(105_000, 1_105_000);
        assert_eq!(engine.snapshot().remaining_ms, 55_000);
        engine.resume(105_000, 1_105_000);
        engine.tick(110_000, 1_110_000);
        assert_eq!(engine.snapshot().focus_elapsed_ms, 10_000);
    }

    #[test]
    fn long_gap_pauses_without_counting_missing_time() {
        let mut engine = SessionEngine::default();
        start(&mut engine);
        engine.tick(30_000, 1_030_000);
        assert_eq!(engine.snapshot().phase, Phase::Paused);
        assert_eq!(engine.snapshot().focus_elapsed_ms, 0);
        assert!(engine.snapshot().interrupted);
    }

    #[test]
    fn wall_clock_sleep_is_detected_even_if_monotonic_clock_stopped() {
        let mut engine = SessionEngine::default();
        start(&mut engine);
        engine.tick(1_000, 2_000_000);
        assert_eq!(engine.snapshot().phase, Phase::Paused);
        assert_eq!(engine.snapshot().remaining_ms, MINUTE);
    }

    #[test]
    fn due_timer_never_automatically_starts_a_break() {
        let mut engine = SessionEngine::default();
        start(&mut engine);
        for t in 1..=70 {
            engine.tick(t * 1000, 1_000_000 + t * 1000);
        }
        assert_eq!(engine.snapshot().phase, Phase::BreakReady);
        assert_eq!(engine.snapshot().focus_elapsed_ms, MINUTE);
        assert_eq!(engine.snapshot().break_elapsed_ms, 0);
    }

    #[test]
    fn breaks_can_be_ended_without_success_conditions() {
        let mut engine = SessionEngine::default();
        engine
            .start_break("rest".into(), 300_000, 0, 1_000_000)
            .unwrap();
        engine.finish(1000, 1_001_000);
        assert_eq!(engine.snapshot().phase, Phase::Complete);
        assert_eq!(engine.snapshot().break_elapsed_ms, 1000);
    }

    #[test]
    fn invalid_start_cannot_mutate_state() {
        let mut engine = SessionEngine::default();
        let before = engine.snapshot();
        assert!(engine
            .start(
                StartOptions {
                    id: "x".into(),
                    task: " ".into(),
                    mode: WorkStyle::Deep,
                    duration_ms: 0
                },
                0,
                0
            )
            .is_err());
        assert_eq!(engine.snapshot(), before);
    }

    #[test]
    fn crash_recovery_always_requires_resume() {
        let mut engine = SessionEngine::default();
        start(&mut engine);
        engine.tick(5000, 1_005_000);
        let mut recovered = SessionEngine::default();
        recovered.restore(engine.snapshot(), 0, 9_000_000).unwrap();
        assert_eq!(recovered.snapshot().phase, Phase::Paused);
        assert_eq!(recovered.snapshot().focus_elapsed_ms, 5000);
    }
}
