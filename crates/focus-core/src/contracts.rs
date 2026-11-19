//! The browser adapter and native engine replay the exact same JSON scenarios.
use crate::{
    rhythm,
    session::{SessionEngine, StartOptions},
};
use serde_json::Value;

#[test]
fn shared_session_scenarios() {
    let cases: Value =
        serde_json::from_str(include_str!("../../../fixtures/session-scenarios.json")).unwrap();
    for case in cases.as_array().unwrap() {
        let mut engine = SessionEngine::default();
        for step in case["steps"].as_array().unwrap() {
            let mono = step["mono"].as_u64().unwrap();
            let wall = step["wall"].as_u64().unwrap();
            match step["op"].as_str().unwrap() {
                "start" => {
                    let options: StartOptions =
                        serde_json::from_value(step["options"].clone()).unwrap();
                    engine.start(options, mono, wall).unwrap();
                }
                "tick" => engine.tick(mono, wall),
                "pause" => {
                    engine.pause(mono, wall);
                }
                "resume" => {
                    engine.resume(mono, wall);
                }
                "finish" => {
                    engine.finish(mono, wall);
                }
                "break" => {
                    engine
                        .start_break(
                            step["id"].as_str().unwrap().into(),
                            step["durationMs"].as_u64().unwrap(),
                            mono,
                            wall,
                        )
                        .unwrap();
                }
                "restore" => {
                    engine.tick(mono, wall);
                    let snapshot = engine.snapshot();
                    engine.reset();
                    engine.restore(snapshot, mono, wall).unwrap();
                }
                "reset" => {
                    engine.reset();
                }
                op => panic!("unknown fixture operation {op}"),
            }
        }
        let actual = serde_json::to_value(engine.snapshot()).unwrap();
        for (key, expected) in case["expected"].as_object().unwrap() {
            assert_eq!(&actual[key], expected, "scenario {}: {key}", case["name"]);
        }
    }
}

#[test]
fn shared_rhythm_scenarios() {
    let cases: Value =
        serde_json::from_str(include_str!("../../../fixtures/rhythm-scenarios.json")).unwrap();
    for case in cases.as_array().unwrap() {
        let summary: rhythm::Summary = serde_json::from_value(case["summary"].clone()).unwrap();
        let baseline: Option<[f64; 5]> = serde_json::from_value(case["baseline"].clone()).unwrap();
        let actual = serde_json::to_value(rhythm::compare(&summary, baseline)).unwrap();
        assert_eq!(
            actual["status"], case["status"],
            "scenario {}",
            case["name"]
        );
    }
}
