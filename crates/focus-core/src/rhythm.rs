//! Receives only coarse summaries. This is not an emotion or identity classifier.
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Summary {
    pub key_count: u32,
    pub pointer_events: u32,
    pub editing_count: u32,
    pub clicks: u32,
    pub scrolls: u32,
    pub intervals: [u32; 5],
    pub observed_ms: u64,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Status {
    Unknown,
    Steady,
    Changed,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Comparison {
    pub status: Status,
    pub reason: &'static str,
}

pub fn compare(summary: &Summary, baseline: Option<[f64; 5]>) -> Comparison {
    let total: u64 = summary.intervals.iter().map(|&n| u64::from(n)).sum();
    if summary.observed_ms < 5000
        || summary.observed_ms > 30_000
        || [
            summary.key_count,
            summary.pointer_events,
            summary.editing_count,
            summary.clicks,
            summary.scrolls,
        ]
        .iter()
        .any(|&n| n > 1_000_000)
        || summary.intervals.iter().any(|&n| n > 1_000_000)
        || total < 8
        || total > u64::from(summary.key_count)
    {
        return Comparison {
            status: Status::Unknown,
            reason: "More valid typing is needed. Missing or sparse input is not disengagement.",
        };
    }
    let Some(baseline) = baseline else {
        return Comparison {
            status: Status::Unknown,
            reason: "No baseline yet. Save a comparison sample when you are comfortable.",
        };
    };
    if baseline
        .iter()
        .any(|v| !v.is_finite() || !(0.0..=1.0).contains(v))
        || (baseline.iter().sum::<f64>() - 1.0).abs() > 0.01
    {
        return Comparison {
            status: Status::Unknown,
            reason: "The baseline is invalid. Reset it before comparing.",
        };
    }
    let distance: f64 = summary
        .intervals
        .iter()
        .zip(baseline)
        .map(|(&value, reference)| (f64::from(value) / total as f64 - reference).abs())
        .sum::<f64>()
        / 2.0;
    if distance > 0.35 {
        Comparison { status: Status::Changed, reason: "Cadence differs from your sample. The cause is unknown; this is not a boredom or mood verdict." }
    } else {
        Comparison {
            status: Status::Steady,
            reason: "Cadence resembles your sample. This does not establish psychological flow.",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn sample() -> Summary {
        Summary {
            key_count: 20,
            pointer_events: 0,
            editing_count: 0,
            clicks: 0,
            scrolls: 0,
            intervals: [0, 19, 0, 0, 0],
            observed_ms: 10_000,
        }
    }
    #[test]
    fn missing_baseline_abstains() {
        assert_eq!(compare(&sample(), None).status, Status::Unknown);
    }
    #[test]
    fn sparse_input_is_not_disengagement() {
        let mut s = sample();
        s.key_count = 1;
        s.intervals = [0; 5];
        assert_eq!(
            compare(&s, Some([0., 1., 0., 0., 0.])).status,
            Status::Unknown
        );
    }
    #[test]
    fn compares_patterns_without_a_mood_label() {
        assert_eq!(
            compare(&sample(), Some([0., 1., 0., 0., 0.])).status,
            Status::Steady
        );
        assert_eq!(
            compare(&sample(), Some([1., 0., 0., 0., 0.])).status,
            Status::Changed
        );
    }
    #[test]
    fn invalid_and_nonfinite_baselines_abstain() {
        assert_eq!(
            compare(&sample(), Some([f64::NAN; 5])).status,
            Status::Unknown
        );
        assert_eq!(compare(&sample(), Some([1.; 5])).status, Status::Unknown);
    }
    #[test]
    fn oversized_summaries_abstain() {
        let mut s = sample();
        s.observed_ms = u64::MAX;
        assert_eq!(
            compare(&s, Some([0., 1., 0., 0., 0.])).status,
            Status::Unknown
        );
    }
}
