//! Voluntary, rate-limited invitations. No fatigue/attention inference, OS input,
//! enforced break, or screen-text instruction can enter this policy.
use crate::session::{Phase, Snapshot};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Config {
    pub enabled: bool,
    pub reminders: bool,
    pub interval_minutes: u32,
    pub presentation: bool,
    pub quiet: bool,
    pub theme: String,
    pub reduce_motion: bool,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            enabled: false,
            reminders: false,
            interval_minutes: 25,
            presentation: false,
            quiet: true,
            theme: "light".into(),
            reduce_motion: false,
        }
    }
}
impl Config {
    pub fn validate(&self) -> Result<(), String> {
        if !(10..=90).contains(&self.interval_minutes)
            || !["light", "dark"].contains(&self.theme.as_str())
        {
            return Err(
                "Choose a reminder interval from 10 to 90 minutes and a supported theme.".into(),
            );
        }
        Ok(())
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Reason {
    Scheduled,
    SessionComplete,
    ScreenContext,
}
#[derive(Default)]
pub struct Policy {
    pub config: Config,
    pub reason: Option<Reason>,
    session: Option<String>,
    acknowledged_focus: u64,
    completed: bool,
    notices: Vec<u64>,
    last_notice: Option<u64>,
    snooze_until: u64,
    snoozed: Option<Reason>,
    votes: u8,
    last_vote: Option<u64>,
}
impl Policy {
    pub fn configure(&mut self, config: Config) -> Result<(), String> {
        config.validate()?;
        if !config.enabled || !config.reminders || config.presentation {
            self.dismiss();
        }
        self.config = config;
        Ok(())
    }
    fn issue(&mut self, reason: Reason, snapshot: &Snapshot, now: u64) {
        self.notices.retain(|t| now >= *t && now - *t < 3_600_000);
        if !self.config.enabled
            || !self.config.reminders
            || self.config.presentation
            || self.reason.is_some()
            || now < self.snooze_until
            || self
                .last_notice
                .is_some_and(|t| now.saturating_sub(t) < 600_000)
            || self.notices.len() >= 3
        {
            return;
        }
        self.reason = Some(reason);
        self.last_notice = Some(now);
        self.notices.push(now);
        self.acknowledged_focus = snapshot.focus_elapsed_ms;
        self.completed |= reason == Reason::SessionComplete;
        self.snoozed = None;
    }
    pub fn observe(&mut self, snapshot: &Snapshot, now: u64) {
        if snapshot.id != self.session {
            self.session.clone_from(&snapshot.id);
            self.acknowledged_focus = 0;
            self.completed = false;
            self.dismiss();
        }
        if !matches!(snapshot.phase, Phase::Focus | Phase::BreakReady) {
            self.reason = None;
            self.votes = 0;
            return;
        }
        if now >= self.snooze_until {
            if let Some(reason) = self.snoozed {
                self.issue(reason, snapshot, now);
            }
        }
        if snapshot.phase == Phase::BreakReady && !self.completed {
            self.issue(Reason::SessionComplete, snapshot, now);
        } else if snapshot.phase == Phase::Focus
            && snapshot
                .focus_elapsed_ms
                .saturating_sub(self.acknowledged_focus)
                >= u64::from(self.config.interval_minutes) * 60_000
        {
            self.issue(Reason::Scheduled, snapshot, now);
        }
    }
    pub fn advice(&mut self, suggest: bool, snapshot: &Snapshot, now: u64) {
        self.observe(snapshot, now);
        if !suggest
            || self.config.quiet
            || snapshot.phase != Phase::Focus
            || snapshot.focus_elapsed_ms < 600_000
        {
            self.votes = 0;
            return;
        }
        if self
            .last_vote
            .is_some_and(|t| now.saturating_sub(t) < 60_000)
        {
            return;
        }
        self.votes = if self
            .last_vote
            .is_some_and(|t| now.saturating_sub(t) <= 300_000)
        {
            self.votes + 1
        } else {
            1
        };
        self.last_vote = Some(now);
        if self.votes >= 2 {
            self.issue(Reason::ScreenContext, snapshot, now);
            self.votes = 0;
        }
    }
    pub fn dismiss(&mut self) {
        self.reason = None;
        self.votes = 0;
        self.snoozed = None;
        self.last_vote = None;
    }
    pub fn snooze(&mut self, now: u64) {
        self.snoozed = self.reason;
        self.reason = None;
        self.snooze_until = now.saturating_add(600_000);
        self.votes = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn setup() -> (Policy, Snapshot) {
        let mut p = Policy::default();
        p.configure(Config {
            enabled: true,
            reminders: true,
            interval_minutes: 90,
            quiet: false,
            ..Config::default()
        })
        .unwrap();
        (
            p,
            Snapshot {
                id: Some("one".into()),
                phase: Phase::Focus,
                focus_elapsed_ms: 600_000,
                ..Snapshot::default()
            },
        )
    }
    #[test]
    fn opt_in_and_elapsed_time_only() {
        let (mut p, mut s) = setup();
        p.config.interval_minutes = 10;
        p.config.enabled = false;
        p.observe(&s, 600_000);
        assert_eq!(p.reason, None);
        p.config.enabled = true;
        p.observe(&s, 600_000);
        assert_eq!(p.reason, Some(Reason::Scheduled));
        p.dismiss();
        p.observe(&s, 1_200_000);
        assert_eq!(p.reason, None);
        s.focus_elapsed_ms += 600_000;
        p.observe(&s, 1_200_000);
        assert_eq!(p.reason, Some(Reason::Scheduled));
    }
    #[test]
    fn advice_requires_two_spaced_votes_and_is_advisory_only() {
        let (mut p, s) = setup();
        p.advice(true, &s, 600_000);
        p.advice(true, &s, 630_000);
        assert_eq!(p.reason, None);
        p.advice(true, &s, 690_000);
        assert_eq!(p.reason, Some(Reason::ScreenContext));
        assert_eq!(s.phase, Phase::Focus);
        p.dismiss();
        p.config.quiet = true;
        p.advice(true, &s, 1_300_000);
        p.advice(true, &s, 1_390_000);
        assert_eq!(p.reason, None);
    }
    #[test]
    fn cooldown_snooze_and_hourly_budget_survive_new_sessions() {
        let (mut p, mut s) = setup();
        s.phase = Phase::BreakReady;
        p.observe(&s, 0);
        p.snooze(0);
        p.observe(&s, 599_999);
        assert_eq!(p.reason, None);
        p.observe(&s, 600_000);
        assert!(p.reason.is_some());
        p.dismiss();
        s.id = Some("two".into());
        p.observe(&s, 1_200_000);
        assert!(p.reason.is_some());
        p.dismiss();
        s.id = Some("three".into());
        p.observe(&s, 1_800_000);
        assert_eq!(p.reason, None);
        p.observe(&s, 3_600_001);
        assert!(p.reason.is_some());
    }
    #[test]
    fn pause_presentation_and_session_change_clear_invitations() {
        let (mut p, mut s) = setup();
        s.phase = Phase::BreakReady;
        p.observe(&s, 0);
        let mut config = p.config.clone();
        config.presentation = true;
        p.configure(config).unwrap();
        assert_eq!(p.reason, None);
        p.observe(&s, 1_000_000);
        assert_eq!(p.reason, None);
        p.config.presentation = false;
        s.phase = Phase::Paused;
        p.observe(&s, 2_000_000);
        assert_eq!(p.reason, None);
    }
}
