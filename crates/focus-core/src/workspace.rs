//! Versioned, bounded application data. Sensors, conversations, and credentials
//! have no fields in this schema. Native deserialization rejects unknown fields.
use crate::session::{SessionEngine, Snapshot, WorkStyle};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Intention {
    id: String,
    title: String,
    mode: WorkStyle,
    completed: bool,
    created_at: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum Kind {
    Focus,
    Break,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum CheckIn {
    InTheZone,
    Steady,
    Stuck,
    Tired,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Record {
    id: String,
    kind: Kind,
    task: String,
    mode: WorkStyle,
    started_at: u64,
    duration_ms: u64,
    completed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    check_in: Option<CheckIn>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum Theme {
    Light,
    Dark,
    System,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    focus_minutes: u32,
    break_minutes: u32,
    daily_goal_minutes: u32,
    protect_focus: bool,
    keep_history: bool,
    theme: Theme,
    reduce_motion: bool,
    #[serde(default)]
    overlay_enabled: bool,
    #[serde(default)]
    gentle_reminders: bool,
    #[serde(default = "reminder_default")]
    reminder_minutes: u32,
}
fn reminder_default() -> u32 {
    25
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            focus_minutes: 25,
            break_minutes: 5,
            daily_goal_minutes: 120,
            protect_focus: true,
            keep_history: true,
            theme: Theme::Light,
            reduce_motion: false,
            overlay_enabled: false,
            gentle_reminders: false,
            reminder_minutes: 25,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Workspace {
    schema_version: u8,
    intentions: Vec<Intention>,
    sessions: Vec<Record>,
    settings: Settings,
    pub checkpoint: Option<Snapshot>,
}
impl Default for Workspace {
    fn default() -> Self {
        Self {
            schema_version: 1,
            intentions: Vec::new(),
            sessions: Vec::new(),
            settings: Settings::default(),
            checkpoint: None,
        }
    }
}
impl Workspace {
    pub fn validate(&mut self, now: u64) -> Result<(), String> {
        let s = &self.settings;
        if self.schema_version != 1
            || self.intentions.len() > 100
            || self.sessions.len() > 500
            || !(1..=180).contains(&s.focus_minutes)
            || !(1..=30).contains(&s.break_minutes)
            || !(15..=480).contains(&s.daily_goal_minutes)
            || !(10..=90).contains(&s.reminder_minutes)
        {
            return Err(
                "Workspace version or bounds are invalid; the existing file was not modified."
                    .into(),
            );
        }
        let mut intentions = HashSet::new();
        let mut records = HashSet::new();
        if self.intentions.iter().any(|i| {
            i.id.is_empty()
                || i.id.encode_utf16().count() > 80
                || !intentions.insert(&i.id)
                || i.title.trim().is_empty()
                || i.title.encode_utf16().count() > 160
                || i.created_at > now.saturating_add(86_400_000)
        }) || self.sessions.iter().any(|r| {
            r.id.is_empty()
                || r.id.encode_utf16().count() > 100
                || !records.insert(&r.id)
                || r.task.encode_utf16().count() > 160
                || r.duration_ms == 0
                || r.duration_ms
                    > match r.kind {
                        Kind::Focus => 180 * 60_000,
                        Kind::Break => 30 * 60_000,
                    }
                || r.started_at > now.saturating_add(86_400_000)
        }) {
            return Err(
                "Workspace records failed validation; the existing file was not modified.".into(),
            );
        }
        self.sessions
            .retain(|r| r.started_at >= now.saturating_sub(30 * 86_400_000));
        if !s.keep_history {
            self.sessions.clear();
        }
        if self.checkpoint.as_ref().is_some_and(|c| {
            c.started_at
                .is_some_and(|t| t < now.saturating_sub(30 * 86_400_000))
        }) {
            self.checkpoint = None;
        }
        if let Some(checkpoint) = &self.checkpoint {
            SessionEngine::default().restore(checkpoint.clone(), 0, now)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const NOW: u64 = 50 * 86_400_000;
    fn record(id: &str, when: u64) -> Record {
        Record {
            id: id.into(),
            kind: Kind::Focus,
            task: "A private intention".into(),
            mode: WorkStyle::Deep,
            started_at: when,
            duration_ms: 60_000,
            completed: true,
            check_in: None,
        }
    }
    #[test]
    fn defaults_are_valid_and_have_no_sensor_or_chat_fields() {
        let mut data = Workspace::default();
        assert!(data.validate(NOW).is_ok());
        let serialized = serde_json::to_value(data).unwrap();
        let mut keys: Vec<_> = serialized
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        keys.sort();
        assert_eq!(
            keys,
            [
                "checkpoint",
                "intentions",
                "schemaVersion",
                "sessions",
                "settings"
            ]
        );
    }
    #[test]
    fn unknown_sensitive_fields_are_rejected() {
        let mut json = serde_json::to_value(Workspace::default()).unwrap();
        json["sensorWindows"] = serde_json::json!([]);
        assert!(serde_json::from_value::<Workspace>(json).is_err());
    }
    #[test]
    fn retention_and_history_opt_out_are_enforced() {
        let mut data = Workspace::default();
        data.sessions = vec![record("old", NOW - 31 * 86_400_000), record("recent", NOW)];
        data.validate(NOW).unwrap();
        assert_eq!(data.sessions.len(), 1);
        data.settings.keep_history = false;
        data.validate(NOW).unwrap();
        assert!(data.sessions.is_empty());
    }
    #[test]
    fn bounds_duplicate_ids_and_versions_are_checked() {
        let mut data = Workspace::default();
        data.sessions = vec![record("same", NOW), record("same", NOW)];
        assert!(data.validate(NOW).is_err());
        data.sessions.clear();
        data.schema_version = 2;
        assert!(data.validate(NOW).is_err());
        data.schema_version = 1;
        data.settings.focus_minutes = 0;
        assert!(data.validate(NOW).is_err());
    }
    #[test]
    fn break_records_have_their_own_duration_bound() {
        let mut data = Workspace::default();
        let mut rest = record("rest", NOW);
        rest.kind = Kind::Break;
        rest.duration_ms = 31 * 60_000;
        data.sessions.push(rest);
        assert!(data.validate(NOW).is_err());
    }
    #[test]
    fn old_v1_preferences_migrate_additively_without_restoring_screen_consent() {
        let mut value = serde_json::to_value(Workspace::default()).unwrap();
        for key in ["overlayEnabled", "gentleReminders", "reminderMinutes"] {
            value["settings"].as_object_mut().unwrap().remove(key);
        }
        let mut restored: Workspace = serde_json::from_value(value.clone()).unwrap();
        restored.validate(NOW).unwrap();
        assert!(!restored.settings.overlay_enabled);
        assert!(!restored.settings.gentle_reminders);
        assert_eq!(restored.settings.reminder_minutes, 25);
        value["settings"]["screenSharing"] = serde_json::json!(true);
        assert!(serde_json::from_value::<Workspace>(value).is_err());
    }
}
